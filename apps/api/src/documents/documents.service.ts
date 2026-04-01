import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import {
  createDocumentRequestSchema,
  documentEntityReferenceSchema,
  documentIdParamsSchema,
  entityIdParamsSchema,
  spaceIdParamsSchema,
  updateDocumentRequestSchema,
  upsertEntityDocumentRequestSchema,
} from '@ryba/schemas';
import type {
  DocumentBacklinkRecord,
  DocumentBlock,
  DocumentDetailRecord,
  DocumentEntityPreview,
  DocumentEntityReference,
  DocumentRecord,
} from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import {
  toDocumentBacklinkRecord,
  toDocumentEntityPreview,
  toDocumentRecord,
  toEntityRecord,
} from '../db/mappers';
import { documentEntityMentions, documents, entities, relations, spaces } from '../db/schema';
import { EntityTypesService } from '../entity-types/entity-types.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type DocumentIdParams = z.infer<typeof documentIdParamsSchema>;
type EntityIdParams = z.infer<typeof entityIdParamsSchema>;
type CreateDocumentRequest = z.infer<typeof createDocumentRequestSchema>;
type UpdateDocumentRequest = z.infer<typeof updateDocumentRequestSchema>;
type UpsertEntityDocumentRequest = z.infer<typeof upsertEntityDocumentRequestSchema>;

type SpaceRow = typeof spaces.$inferSelect;
type DocumentRow = typeof documents.$inferSelect;
type EntityRow = typeof entities.$inferSelect;

const DOCUMENT_RELATION_TYPE = 'document_link';

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(EntityTypesService)
    private readonly entityTypesService: EntityTypesService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
  ) {}

  async listDocuments(userId: string, params: SpaceIdParams): Promise<DocumentRecord[]> {
    const db = this.getDb();
    const space = await this.requireSpaceAccess(userId, params.spaceId);

    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.workspaceId, space.workspaceId), eq(documents.spaceId, space.id)))
      .orderBy(desc(documents.updatedAt), asc(documents.createdAt));

    return rows.map(toDocumentRecord);
  }

  async createDocument(
    userId: string,
    params: SpaceIdParams,
    payload: CreateDocumentRequest,
  ): Promise<DocumentDetailRecord> {
    const space = await this.requireSpaceAccess(userId, params.spaceId);
    const entity = await this.createBackingEntity(userId, space, payload.title.trim(), payload.body);

    return this.createDocumentForEntity(userId, entity, {
      title: payload.title,
      body: payload.body,
    });
  }

  async getDocument(userId: string, params: DocumentIdParams): Promise<DocumentDetailRecord> {
    const document = await this.requireDocumentAccess(userId, params.documentId);

    return this.buildDocumentDetail(document);
  }

  async getDocumentForEntity(userId: string, params: EntityIdParams): Promise<DocumentDetailRecord> {
    const entity = await this.requireEntityAccess(userId, params.entityId);
    const document = await this.findDocumentByEntityId(entity.id);

    if (!document) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Document for entity not found');
    }

    return this.buildDocumentDetail(document);
  }

  async updateDocument(
    userId: string,
    params: DocumentIdParams,
    payload: UpdateDocumentRequest,
  ): Promise<DocumentDetailRecord> {
    const document = await this.requireDocumentAccess(userId, params.documentId);
    const entity = await this.requireEntityAccess(userId, document.entityId);

    return this.persistDocument(userId, entity, document, payload);
  }

  async upsertDocumentForEntity(
    userId: string,
    params: EntityIdParams,
    payload: UpsertEntityDocumentRequest,
  ): Promise<DocumentDetailRecord> {
    const entity = await this.requireEntityAccess(userId, params.entityId);
    const existing = await this.findDocumentByEntityId(entity.id);

    if (existing) {
      return this.persistDocument(userId, entity, existing, payload);
    }

    return this.createDocumentForEntity(userId, entity, payload);
  }

  async listDocumentBacklinks(
    userId: string,
    params: EntityIdParams,
  ): Promise<DocumentBacklinkRecord[]> {
    const db = this.getDb();
    const entity = await this.requireEntityAccess(userId, params.entityId);

    const rows = await db
      .select({
        mention: documentEntityMentions,
        document: documents,
      })
      .from(documentEntityMentions)
      .innerJoin(documents, eq(documentEntityMentions.documentId, documents.id))
      .where(eq(documentEntityMentions.entityId, entity.id))
      .orderBy(desc(documents.updatedAt), asc(documentEntityMentions.createdAt));

    return rows.map((row) => toDocumentBacklinkRecord(row.mention, toDocumentRecord(row.document)));
  }

  private async createDocumentForEntity(
    userId: string,
    entity: EntityRow,
    payload: { title?: string; body?: DocumentBlock[] },
  ): Promise<DocumentDetailRecord> {
    const db = this.getDb();
    const now = new Date().toISOString();
    const documentId = randomUUID();
    const body = payload.body ?? [];
    const title = payload.title?.trim() || entity.title;
    const previewText = buildPreviewText(body);
    const mentionRows = await this.buildMentionRows(entity, body);

    await db.transaction(async (tx) => {
      await tx
        .update(entities)
        .set({
          title,
          summary: previewText || entity.summary,
          updatedByUserId: userId,
          updatedAt: now,
        })
        .where(eq(entities.id, entity.id));

      await tx.insert(documents).values({
        id: documentId,
        workspaceId: entity.workspaceId,
        spaceId: entity.spaceId,
        entityId: entity.id,
        title,
        body,
        previewText,
        createdByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now,
      });

      if (mentionRows.length > 0) {
        await tx.insert(documentEntityMentions).values(
          mentionRows.map((mention) => ({
            id: randomUUID(),
            documentId,
            workspaceId: entity.workspaceId,
            spaceId: entity.spaceId,
            entityId: mention.entityId,
            blockId: mention.blockId,
            label: mention.label,
            anchorId: mention.anchorId,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }
    });

    await this.syncDocumentRelations(userId, {
      documentId,
      workspaceId: entity.workspaceId,
      spaceId: entity.spaceId,
      sourceEntityId: entity.id,
      mentions: mentionRows,
    });

    return this.getDocument(userId, { documentId });
  }

  private async persistDocument(
    userId: string,
    entity: EntityRow,
    document: DocumentRow,
    payload: { title?: string; body?: DocumentBlock[] },
  ): Promise<DocumentDetailRecord> {
    const db = this.getDb();
    const now = new Date().toISOString();
    const nextBody = payload.body ?? toDocumentRecord(document).body;
    const nextTitle = payload.title?.trim() || entity.title;
    const previewText = buildPreviewText(nextBody);
    const mentionRows = await this.buildMentionRows(entity, nextBody);

    await db.transaction(async (tx) => {
      await tx
        .update(entities)
        .set({
          title: nextTitle,
          summary: previewText || entity.summary,
          updatedByUserId: userId,
          updatedAt: now,
        })
        .where(eq(entities.id, entity.id));

      await tx
        .update(documents)
        .set({
          title: nextTitle,
          body: nextBody,
          previewText,
          updatedByUserId: userId,
          updatedAt: now,
        })
        .where(eq(documents.id, document.id));

      await tx.delete(documentEntityMentions).where(eq(documentEntityMentions.documentId, document.id));

      if (mentionRows.length > 0) {
        await tx.insert(documentEntityMentions).values(
          mentionRows.map((mention) => ({
            id: randomUUID(),
            documentId: document.id,
            workspaceId: entity.workspaceId,
            spaceId: entity.spaceId,
            entityId: mention.entityId,
            blockId: mention.blockId,
            label: mention.label,
            anchorId: mention.anchorId,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }
    });

    await this.syncDocumentRelations(userId, {
      documentId: document.id,
      workspaceId: entity.workspaceId,
      spaceId: entity.spaceId,
      sourceEntityId: entity.id,
      mentions: mentionRows,
    });

    return this.getDocument(userId, { documentId: document.id });
  }

  private async buildDocumentDetail(document: DocumentRow): Promise<DocumentDetailRecord> {
    const record = toDocumentRecord(document);
    const entity = await this.requireEntityByWorkspace(record.workspaceId, record.entityId);
    const mentions = flattenDocumentMentions(record.body);
    const mentionedEntities = await this.loadMentionedEntities(record, mentions);

    return {
      document: record,
      entity: {
        id: entity.id,
        title: entity.title,
        summary: entity.summary,
        entityTypeId: entity.entityTypeId,
      },
      mentions,
      mentionedEntities,
    };
  }

  private async createBackingEntity(
    userId: string,
    space: SpaceRow,
    title: string,
    body: DocumentBlock[],
  ): Promise<EntityRow> {
    const db = this.getDb();
    const defaultType = await this.entityTypesService.resolveEntityTypeForWorkspace(space.workspaceId, null);
    const previewText = buildPreviewText(body);
    const [entity] = await db
      .insert(entities)
      .values({
        id: randomUUID(),
        workspaceId: space.workspaceId,
        spaceId: space.id,
        entityTypeId: defaultType?.id ?? null,
        title,
        summary: previewText || null,
        properties: {},
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .returning();

    return entity;
  }

  private async loadMentionedEntities(
    document: DocumentRecord,
    mentions: DocumentEntityReference[],
  ): Promise<DocumentEntityPreview[]> {
    const db = this.getDb();
    const uniqueMentions = new Map<string, DocumentEntityReference>();

    for (const mention of mentions) {
      if (!uniqueMentions.has(mention.entityId)) {
        uniqueMentions.set(mention.entityId, mention);
      }
    }

    const entityIds = Array.from(uniqueMentions.keys());

    if (entityIds.length === 0) {
      return [];
    }

    const rows = await db
      .select()
      .from(entities)
      .where(
        and(
          eq(entities.workspaceId, document.workspaceId),
          eq(entities.spaceId, document.spaceId),
          inArray(entities.id, entityIds),
        ),
      );

    return rows.map((row) =>
      toDocumentEntityPreview(uniqueMentions.get(row.id)!, toEntityRecord(row)),
    );
  }

  private async buildMentionRows(
    entity: Pick<EntityRow, 'id' | 'workspaceId' | 'spaceId'>,
    body: DocumentBlock[],
  ) {
    const mentions = body.flatMap((block) =>
      block.entityReferences.map((reference) => ({
        blockId: block.id,
        entityId: reference.entityId,
        label: reference.label,
        anchorId: reference.anchorId,
      })),
    );

    if (mentions.length === 0) {
      return [];
    }

    const db = this.getDb();
    const uniqueEntityIds = Array.from(new Set(mentions.map((mention) => mention.entityId)));
    const rows = await db
      .select()
      .from(entities)
      .where(
        and(
          eq(entities.workspaceId, entity.workspaceId),
          eq(entities.spaceId, entity.spaceId),
          inArray(entities.id, uniqueEntityIds),
        ),
      );

    if (rows.length !== uniqueEntityIds.length) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Document mentions must reference existing entities in the same space',
      );
    }

    return mentions.filter((mention) => mention.entityId !== entity.id);
  }

  private async syncDocumentRelations(
    userId: string,
    input: {
      documentId: string;
      workspaceId: string;
      spaceId: string;
      sourceEntityId: string;
      mentions: Array<{
        entityId: string;
        blockId: string;
        label: string | null;
        anchorId: string | null;
      }>;
    },
  ) {
    const db = this.getDb();
    const now = new Date().toISOString();
    const mentionByTargetId = new Map(
      input.mentions.map((mention) => [mention.entityId, mention]),
    );
    const targetEntityIds = Array.from(mentionByTargetId.keys());

    const existingRows = await db
      .select()
      .from(relations)
      .where(
        and(
          eq(relations.workspaceId, input.workspaceId),
          eq(relations.spaceId, input.spaceId),
          eq(relations.fromEntityId, input.sourceEntityId),
          eq(relations.relationType, DOCUMENT_RELATION_TYPE),
        ),
      );

    const existingByTargetId = new Map(
      existingRows
        .filter((row) => extractSourceDocumentId(row.properties) === input.documentId)
        .map((row) => [row.toEntityId, row]),
    );

    await db.transaction(async (tx) => {
      for (const [targetEntityId, existingRow] of existingByTargetId) {
        if (!targetEntityIds.includes(targetEntityId)) {
          await tx.delete(relations).where(eq(relations.id, existingRow.id));
          continue;
        }

        const mention = mentionByTargetId.get(targetEntityId);

        await tx
          .update(relations)
          .set({
            properties: {
              source: 'document_mention',
              sourceDocumentId: input.documentId,
              label: mention?.label ?? null,
              anchorId: mention?.anchorId ?? null,
            },
            updatedByUserId: userId,
            updatedAt: now,
          })
          .where(eq(relations.id, existingRow.id));
      }

      for (const targetEntityId of targetEntityIds) {
        if (existingByTargetId.has(targetEntityId)) {
          continue;
        }

        const mention = mentionByTargetId.get(targetEntityId);

        await tx.insert(relations).values({
          id: randomUUID(),
          workspaceId: input.workspaceId,
          spaceId: input.spaceId,
          fromEntityId: input.sourceEntityId,
          toEntityId: targetEntityId,
          relationType: DOCUMENT_RELATION_TYPE,
          properties: {
            source: 'document_mention',
            sourceDocumentId: input.documentId,
            label: mention?.label ?? null,
            anchorId: mention?.anchorId ?? null,
          },
          createdByUserId: userId,
          updatedByUserId: userId,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
  }

  private async findDocumentByEntityId(entityId: string): Promise<DocumentRow | null> {
    const db = this.getDb();
    return (
      (await db.query.documents.findFirst({
        where: eq(documents.entityId, entityId),
      })) ?? null
    );
  }

  private async requireDocumentAccess(userId: string, documentId: string): Promise<DocumentRow> {
    const db = this.getDb();
    const document = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
    });

    if (!document) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Document not found');
    }

    await this.workspacesService.requireMembership(userId, document.workspaceId);

    return document;
  }

  private async requireEntityAccess(userId: string, entityId: string): Promise<EntityRow> {
    const entity = await this.requireEntityByWorkspace(null, entityId);
    await this.workspacesService.requireMembership(userId, entity.workspaceId);
    return entity;
  }

  private async requireEntityByWorkspace(
    workspaceId: string | null,
    entityId: string,
  ): Promise<EntityRow> {
    const db = this.getDb();
    const entity = await db.query.entities.findFirst({
      where: eq(entities.id, entityId),
    });

    if (!entity || (workspaceId && entity.workspaceId !== workspaceId)) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Entity not found');
    }

    return entity;
  }

  private async requireSpaceAccess(userId: string, spaceId: string): Promise<SpaceRow> {
    const db = this.getDb();
    const space = await db.query.spaces.findFirst({
      where: eq(spaces.id, spaceId),
    });

    if (!space) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Space not found');
    }

    await this.workspacesService.requireMembership(userId, space.workspaceId);

    return space;
  }

  private getDb() {
    const db = this.databaseService.db;

    if (!db) {
      throw new ApiException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'INTERNAL_ERROR',
        'Database is not configured',
      );
    }

    return db;
  }
}

const flattenDocumentMentions = (body: DocumentBlock[]): DocumentEntityReference[] =>
  body.flatMap((block) => block.entityReferences.map((reference) => documentEntityReferenceSchema.parse(reference)));

const buildPreviewText = (body: DocumentBlock[]) =>
  body
    .map((block) => replaceMentionTokens(block.text ?? '', block.entityReferences))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);

const replaceMentionTokens = (text: string, references: DocumentEntityReference[]) => {
  let normalized = text;

  for (const reference of references) {
    const pattern = new RegExp(
      String.raw`\[\[entity:${escapeRegExp(reference.entityId)}(?:\|[^\]]+)?\]\]`,
      'g',
    );

    normalized = normalized.replace(pattern, reference.label ?? reference.entityId);
  }

  return normalized;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractSourceDocumentId = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const properties = value as Record<string, unknown>;

  return typeof properties.sourceDocumentId === 'string' ? properties.sourceDocumentId : null;
};
