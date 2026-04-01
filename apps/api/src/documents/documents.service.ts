import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import {
  createDocumentRequestSchema,
  documentIdParamsSchema,
  documentEntityReferenceSchema,
  entityIdParamsSchema,
  spaceIdParamsSchema,
  updateDocumentRequestSchema,
} from '@ryba/schemas';
import type {
  DocumentBacklinkRecord,
  DocumentBlock,
  DocumentDetailRecord,
  DocumentEntityPreview,
  DocumentEntityReference,
  DocumentRecord,
  EntityRecord,
} from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import {
  toDocumentBacklinkRecord,
  toDocumentEntityPreview,
  toDocumentRecord,
  toEntityRecord,
} from '../db/mappers';
import { documentEntityMentions, documents, entities, spaces } from '../db/schema';
import { WorkspacesService } from '../workspaces/workspaces.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type DocumentIdParams = z.infer<typeof documentIdParamsSchema>;
type EntityIdParams = z.infer<typeof entityIdParamsSchema>;
type CreateDocumentRequest = z.infer<typeof createDocumentRequestSchema>;
type UpdateDocumentRequest = z.infer<typeof updateDocumentRequestSchema>;

type SpaceRow = typeof spaces.$inferSelect;
type DocumentRow = typeof documents.$inferSelect;

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
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
    const db = this.getDb();
    const space = await this.requireSpaceAccess(userId, params.spaceId);
    const body = payload.body;
    const mentionRows = await this.buildMentionRows(space, body);
    const now = new Date().toISOString();
    const documentId = randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(documents).values({
        id: documentId,
        workspaceId: space.workspaceId,
        spaceId: space.id,
        title: payload.title.trim(),
        body,
        previewText: buildPreviewText(body),
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
            workspaceId: space.workspaceId,
            spaceId: space.id,
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

    return this.getDocument(userId, {
      documentId,
    });
  }

  async getDocument(userId: string, params: DocumentIdParams): Promise<DocumentDetailRecord> {
    const document = await this.requireDocumentAccess(userId, params.documentId);

    return this.buildDocumentDetail(document);
  }

  async updateDocument(
    userId: string,
    params: DocumentIdParams,
    payload: UpdateDocumentRequest,
  ): Promise<DocumentDetailRecord> {
    const db = this.getDb();
    const document = await this.requireDocumentAccess(userId, params.documentId);
    const nextBody = payload.body ?? toDocumentRecord(document).body;
    const nextTitle = payload.title?.trim() ?? document.title;
    const mentionRows = await this.buildMentionRows(
      {
        id: document.spaceId,
        workspaceId: document.workspaceId,
      } as SpaceRow,
      nextBody,
    );
    const now = new Date().toISOString();

    await db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({
          title: nextTitle,
          body: nextBody,
          previewText: buildPreviewText(nextBody),
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
            workspaceId: document.workspaceId,
            spaceId: document.spaceId,
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

    return this.getDocument(userId, params);
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

    const seenDocumentIds = new Set<string>();

    return rows.flatMap((row) => {
      if (seenDocumentIds.has(row.document.id)) {
        return [];
      }

      seenDocumentIds.add(row.document.id);

      return [
        toDocumentBacklinkRecord(
          row.mention,
          toDocumentRecord(row.document),
        ),
      ];
    });
  }

  private async buildDocumentDetail(document: DocumentRow): Promise<DocumentDetailRecord> {
    const db = this.getDb();
    const record = toDocumentRecord(document);
    const mentions = flattenDocumentMentions(record.body);
    const mentionedEntities = await this.loadMentionedEntities(record, mentions);

    return {
      document: record,
      mentions,
      mentionedEntities,
    };
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

  private async buildMentionRows(space: Pick<SpaceRow, 'id' | 'workspaceId'>, body: DocumentBlock[]) {
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
          eq(entities.workspaceId, space.workspaceId),
          eq(entities.spaceId, space.id),
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

    return mentions;
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

  private async requireEntityAccess(userId: string, entityId: string) {
    const db = this.getDb();
    const entity = await db.query.entities.findFirst({
      where: eq(entities.id, entityId),
    });

    if (!entity) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Entity not found');
    }

    await this.workspacesService.requireMembership(userId, entity.workspaceId);

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
