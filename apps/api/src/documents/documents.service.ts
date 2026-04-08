import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { z } from 'zod';
import {
  createDocumentRequestSchema,
  documentEntityReferenceSchema,
  documentIdParamsSchema,
  entityIdParamsSchema,
  groupIdParamsSchema,
  spaceIdParamsSchema,
  updateDocumentRequestSchema,
  upsertEntityDocumentRequestSchema,
} from '@ryba/schemas';
import {
  buildDocumentLinkDefinitionIndex,
  buildDocumentLinkToken,
  createDocumentLinkDefinitionReference,
  createDocumentLinkUsageReference,
  escapeRegExp,
  extractDocumentLinkTokens,
  isDocumentLinkDefinitionReference,
  isDocumentLinkUsageReference,
  replaceDocumentLinkTokensForPreview,
} from '@ryba/types';
import type {
  DocumentBacklinkRecord,
  DocumentBlock,
  DocumentDetailRecord,
  DocumentEntityPreview,
  DocumentEntityReference,
  DocumentLinkDefinition,
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
import { GroupsService } from '../groups/groups.service';
import { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type GroupIdParams = z.infer<typeof groupIdParamsSchema>;
type DocumentIdParams = z.infer<typeof documentIdParamsSchema>;
type EntityIdParams = z.infer<typeof entityIdParamsSchema>;
type CreateDocumentRequest = z.infer<typeof createDocumentRequestSchema>;
type UpdateDocumentRequest = z.infer<typeof updateDocumentRequestSchema>;
type UpsertEntityDocumentRequest = z.infer<typeof upsertEntityDocumentRequestSchema>;

type SpaceRow = typeof spaces.$inferSelect;
type DocumentRow = typeof documents.$inferSelect;
type EntityRow = typeof entities.$inferSelect;
type DocumentMentionRow = {
  entityId: string;
  blockId: string;
  label: string | null;
  anchorId: string | null;
  referenceKind: 'entity_mention' | 'document_link_usage';
  linkMode: DocumentEntityReference['linkMode'];
};

const DOCUMENT_RELATION_TYPE = 'document_link';

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(EntityTypesService)
    private readonly entityTypesService: EntityTypesService,
    @Inject(GroupsService)
    private readonly groupsService: GroupsService,
    @Inject(WorkspaceActivityService)
    private readonly workspaceActivityService: WorkspaceActivityService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
  ) {}

  async listDocuments(userId: string, params: SpaceIdParams): Promise<DocumentRecord[]> {
    const space = await this.requireSpaceAccess(userId, params.spaceId, 'read');

    return this.listDocumentsInScope(userId, {
      workspaceId: space.workspaceId,
      spaceId: space.id,
      groupId: null,
    });
  }

  async listGroupDocuments(userId: string, params: GroupIdParams): Promise<DocumentRecord[]> {
    const group = await this.groupsService.requireGroupAccess(userId, params.groupId, 'read');

    return this.listDocumentsInScope(userId, {
      workspaceId: group.workspaceId,
      spaceId: group.spaceId,
      groupId: group.id,
    });
  }

  async createDocument(
    userId: string,
    params: SpaceIdParams,
    payload: CreateDocumentRequest,
  ): Promise<DocumentDetailRecord> {
    const space = await this.requireSpaceAccess(userId, params.spaceId, 'edit');
    const entity = await this.createBackingEntity(userId, space, null, payload.title.trim(), payload.body);

    return this.createDocumentForEntity(userId, entity, {
      title: payload.title,
      body: payload.body,
    });
  }

  async createGroupDocument(
    userId: string,
    params: GroupIdParams,
    payload: CreateDocumentRequest,
  ): Promise<DocumentDetailRecord> {
    const group = await this.groupsService.requireGroupAccess(userId, params.groupId, 'edit');
    const space = await this.requireSpaceAccess(userId, group.spaceId, 'edit');
    const entity = await this.createBackingEntity(
      userId,
      space,
      group.id,
      payload.title.trim(),
      payload.body,
    );

    return this.createDocumentForEntity(userId, entity, {
      title: payload.title,
      body: payload.body,
    });
  }

  async getDocument(userId: string, params: DocumentIdParams): Promise<DocumentDetailRecord> {
    const document = await this.requireDocumentAccess(userId, params.documentId, 'read');

    return this.buildDocumentDetail(document);
  }

  async getDocumentForEntity(userId: string, params: EntityIdParams): Promise<DocumentDetailRecord> {
    const entity = await this.requireEntityAccess(userId, params.entityId, 'read');
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
    const document = await this.requireDocumentAccess(userId, params.documentId, 'edit');
    const entity = await this.requireEntityAccess(userId, document.entityId, 'edit');

    return this.persistDocument(userId, entity, document, payload);
  }

  async upsertDocumentForEntity(
    userId: string,
    params: EntityIdParams,
    payload: UpsertEntityDocumentRequest,
  ): Promise<DocumentDetailRecord> {
    const entity = await this.requireEntityAccess(userId, params.entityId, 'edit');
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
    const entity = await this.requireEntityAccess(userId, params.entityId, 'read');

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

  private async listDocumentsInScope(
    userId: string,
    scope: {
      workspaceId: string;
      spaceId: string;
      groupId: string | null;
    },
  ): Promise<DocumentRecord[]> {
    const db = this.getDb();
    await this.workspacesService.requirePermission(userId, scope.workspaceId, 'read');

    const rows = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.workspaceId, scope.workspaceId),
          eq(documents.spaceId, scope.spaceId),
          scope.groupId ? eq(documents.groupId, scope.groupId) : isNull(documents.groupId),
        ),
      )
      .orderBy(desc(documents.updatedAt), asc(documents.createdAt));

    return rows.map(toDocumentRecord);
  }

  private async createDocumentForEntity(
    userId: string,
    entity: EntityRow,
    payload: { title?: string; body?: DocumentBlock[] },
  ): Promise<DocumentDetailRecord> {
    const db = this.getDb();
    const now = new Date().toISOString();
    const documentId = randomUUID();
    const body = await this.normalizeDocumentBody({
      workspaceId: entity.workspaceId,
      spaceId: entity.spaceId,
      groupId: entity.groupId,
      ownerEntityId: entity.id,
      documentId,
      body: payload.body ?? [],
    });
    const title = payload.title?.trim() || entity.title;
    await this.applySyncedLinkUpdates(userId, {
      workspaceId: entity.workspaceId,
      spaceId: entity.spaceId,
      groupId: entity.groupId,
      documentId,
      body,
    });
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
        groupId: entity.groupId,
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
            groupId: entity.groupId,
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
      groupId: entity.groupId,
      sourceEntityId: entity.id,
      mentions: mentionRows,
    });

    await this.workspaceActivityService.recordEvent({
      workspaceId: entity.workspaceId,
      spaceId: entity.spaceId,
      groupId: entity.groupId,
      actorUserId: userId,
      eventType: 'document.created',
      targetType: 'document',
      targetId: documentId,
      summary: `Document created: ${title}`,
      metadata: {
        entityId: entity.id,
      },
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
    const nextBody = await this.normalizeDocumentBody({
      workspaceId: entity.workspaceId,
      spaceId: entity.spaceId,
      groupId: entity.groupId,
      ownerEntityId: entity.id,
      documentId: document.id,
      body: payload.body ?? toDocumentRecord(document).body,
    });
    const nextTitle = payload.title?.trim() || entity.title;
    await this.applySyncedLinkUpdates(userId, {
      workspaceId: entity.workspaceId,
      spaceId: entity.spaceId,
      groupId: entity.groupId,
      documentId: document.id,
      body: nextBody,
    });
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
            groupId: entity.groupId,
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
      groupId: entity.groupId,
      sourceEntityId: entity.id,
      mentions: mentionRows,
    });

    await this.workspaceActivityService.recordEvent({
      workspaceId: entity.workspaceId,
      spaceId: entity.spaceId,
      groupId: entity.groupId,
      actorUserId: userId,
      eventType: 'document.updated',
      targetType: 'document',
      targetId: document.id,
      summary: `Document updated: ${nextTitle}`,
      metadata: {
        entityId: entity.id,
      },
    });

    return this.getDocument(userId, { documentId: document.id });
  }

  private async normalizeDocumentBody(input: {
    workspaceId: string;
    spaceId: string;
    groupId: string | null;
    ownerEntityId: string;
    documentId: string;
    body: DocumentBlock[];
  }) {
    const documentsInSpace = await this.listSpaceDocuments(
      input.workspaceId,
      input.spaceId,
      input.groupId,
      input.documentId,
    );
    const definitionMap = buildDocumentLinkDefinitionIndex(documentsInSpace);

    return input.body.map((block) => {
      if (block.kind === 'entity_reference') {
        return block;
      }

      const originalText = block.text ?? '';
      const normalizedText = replaceBareLinkKeysFromDefinitions(
        originalText,
        definitionMap,
        input.documentId,
      );
      const usageReferences = block.entityReferences.filter(isDocumentLinkUsageReference);
      const definitionReferences = block.entityReferences.filter(isDocumentLinkDefinitionReference);
      const nonLinkReferences = block.entityReferences.filter(
        (reference) =>
          !isDocumentLinkUsageReference(reference) &&
          !isDocumentLinkDefinitionReference(reference),
      );
      const existingUsageByKey = new Map(
        usageReferences
          .filter((reference) => typeof reference.linkKey === 'string')
          .map((reference) => [reference.linkKey!, reference]),
      );
      const existingDefinitionsByKey = new Map(
        definitionReferences
          .filter((reference) => typeof reference.linkKey === 'string')
          .map((reference) => [reference.linkKey!, reference]),
      );
      const staticBareUsages = findStaticBareUsageDefinitions(
        originalText,
        definitionMap,
        input.documentId,
      );
      let cursor = 0;
      let nextText = '';
      const nextLinkReferences: DocumentEntityReference[] = [];

      for (const token of extractDocumentLinkTokens(normalizedText)) {
        nextText += normalizedText.slice(cursor, token.start);

        const existingReference = existingUsageByKey.get(token.key);
        const definition =
          (existingReference ? resolveDefinitionFromReference(existingReference, definitionMap) : null) ??
          definitionMap.get(token.key);

        if (!definition) {
          nextText += token.raw;
          nextLinkReferences.push(
            createDocumentLinkDefinitionReference({
              entityId: input.ownerEntityId,
              blockId: block.id,
              key: token.key,
              mode: token.mode,
              text: existingDefinitionsByKey.get(token.key)?.linkText ?? token.text,
              documentId: input.documentId,
            }),
          );
          cursor = token.end;
          continue;
        }

        const nextTokenText =
          definition.mode === 'static'
            ? definition.text
            : existingReference?.linkText ?? token.text ?? definition.text;

        nextText +=
          definition.mode === 'static'
            ? definition.key
            : buildDocumentLinkToken({
                key: definition.key,
                mode: definition.mode,
                text: nextTokenText,
              });
        nextLinkReferences.push(
          createDocumentLinkUsageReference({
            entityId: definition.sourceEntityId,
            key: definition.key,
            mode: definition.mode,
            text: nextTokenText,
            sourceDocumentId: definition.sourceDocumentId,
            sourceBlockId: definition.sourceBlockId,
          }),
        );
        cursor = token.end;
      }

      nextText += normalizedText.slice(cursor);

      for (const definition of staticBareUsages) {
        nextLinkReferences.push(
          createDocumentLinkUsageReference({
            entityId: definition.sourceEntityId,
            key: definition.key,
            mode: 'static',
            text: definition.text,
            sourceDocumentId: definition.sourceDocumentId,
            sourceBlockId: definition.sourceBlockId,
          }),
        );
      }

      const nextReferences = [...nonLinkReferences, ...nextLinkReferences];

      if (
        nextText === (block.text ?? '') &&
        JSON.stringify(nextReferences) === JSON.stringify(block.entityReferences)
      ) {
        return block;
      }

      return {
        ...block,
        text: nextText.length > 0 ? nextText : null,
        entityReferences: nextReferences,
      };
    });
  }

  private async applySyncedLinkUpdates(
    userId: string,
    input: {
      workspaceId: string;
      spaceId: string;
      groupId: string | null;
      documentId: string;
      body: DocumentBlock[];
    },
  ) {
    const documentsInSpace = await this.listSpaceDocuments(
      input.workspaceId,
      input.spaceId,
      input.groupId,
      input.documentId,
    );
    const definitionMap = buildDocumentLinkDefinitionIndex(documentsInSpace);
    const syncEdits = new Map<
      string,
      {
        definition: DocumentLinkDefinition;
        nextText: string;
      }
    >();

    for (const block of input.body) {
      if (!block.text) {
        continue;
      }

      const tokens = extractDocumentLinkTokens(block.text);
      const tokenByKey = new Map(tokens.map((token) => [token.key, token]));

      for (const reference of block.entityReferences) {
        if (
          !isDocumentLinkUsageReference(reference) ||
          reference.linkMode !== 'sync' ||
          !reference.linkKey
        ) {
          continue;
        }

        const definition =
          resolveDefinitionFromReference(reference, definitionMap) ?? definitionMap.get(reference.linkKey);

        if (!definition || definition.mode !== 'sync') {
          continue;
        }

        const nextText =
          reference.linkText ??
          tokenByKey.get(definition.key)?.text ??
          definition.text;

        if (nextText === definition.text) {
          continue;
        }

        syncEdits.set(`${definition.sourceDocumentId}:${definition.key}`, {
          definition,
          nextText,
        });
      }
    }

    for (const { definition, nextText } of syncEdits.values()) {
      await this.updateLinkDefinitionText(userId, definition, nextText);
    }
  }

  private async buildDocumentDetail(document: DocumentRow): Promise<DocumentDetailRecord> {
    const record = toDocumentRecord(document);
    const entity = await this.requireEntityByWorkspace(record.workspaceId, record.entityId);
    const mentions = flattenDocumentMentions(record.body).filter(
      (reference) => reference.kind !== 'document_link_definition',
    );
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
    groupId: string | null,
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
        groupId,
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
          document.groupId ? eq(entities.groupId, document.groupId) : isNull(entities.groupId),
          inArray(entities.id, entityIds),
        ),
      );

    return rows.map((row) =>
      toDocumentEntityPreview(uniqueMentions.get(row.id)!, toEntityRecord(row)),
    );
  }

  private async buildMentionRows(
    entity: Pick<EntityRow, 'id' | 'workspaceId' | 'spaceId' | 'groupId'>,
    body: DocumentBlock[],
  ): Promise<DocumentMentionRow[]> {
    const mentions: DocumentMentionRow[] = body.flatMap((block) =>
      block.entityReferences
        .filter((reference) => reference.kind !== 'document_link_definition')
        .map((reference) => ({
          blockId: block.id,
          entityId: reference.entityId,
          label: reference.linkKey ?? reference.label,
          anchorId: reference.sourceBlockId ?? reference.anchorId,
          linkMode: reference.linkMode ?? null,
          referenceKind:
            reference.kind === 'document_link_usage'
              ? ('document_link_usage' as const)
              : ('entity_mention' as const),
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
          entity.groupId ? eq(entities.groupId, entity.groupId) : isNull(entities.groupId),
          inArray(entities.id, uniqueEntityIds),
        ),
      );

    if (rows.length !== uniqueEntityIds.length) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Document mentions must reference existing entities in the same space and group context',
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
      groupId: string | null;
      sourceEntityId: string;
      mentions: DocumentMentionRow[];
    },
  ) {
    const db = this.getDb();
    const now = new Date().toISOString();
    const relationEntries = new Map<
      string,
      {
        fromEntityId: string;
        toEntityId: string;
        mention: (typeof input.mentions)[number];
      }
    >();

    for (const mention of input.mentions) {
      const fromEntityId =
        mention.referenceKind === 'document_link_usage'
          ? mention.entityId
          : input.sourceEntityId;
      const toEntityId =
        mention.referenceKind === 'document_link_usage'
          ? input.sourceEntityId
          : mention.entityId;

      if (fromEntityId === toEntityId) {
        continue;
      }

      relationEntries.set(`${fromEntityId}:${toEntityId}`, {
        fromEntityId,
        toEntityId,
        mention,
      });
    }

    const existingRows = await db
      .select()
      .from(relations)
      .where(
        and(
          eq(relations.workspaceId, input.workspaceId),
          eq(relations.spaceId, input.spaceId),
          input.groupId ? eq(relations.groupId, input.groupId) : isNull(relations.groupId),
          eq(relations.relationType, DOCUMENT_RELATION_TYPE),
        ),
      );

    const existingByKey = new Map(
      existingRows
        .filter((row) => extractSourceDocumentId(row.properties) === input.documentId)
        .map((row) => [`${row.fromEntityId}:${row.toEntityId}`, row]),
    );

    await db.transaction(async (tx) => {
      for (const [relationKey, existingRow] of existingByKey) {
        if (!relationEntries.has(relationKey)) {
          await tx.delete(relations).where(eq(relations.id, existingRow.id));
          continue;
        }

        const entry = relationEntries.get(relationKey);
        const mention = entry?.mention;

        await tx
          .update(relations)
          .set({
            properties: {
              source: 'document_mention',
              sourceDocumentId: input.documentId,
              label: mention?.label ?? null,
              anchorId: mention?.anchorId ?? null,
              referenceKind: mention?.referenceKind ?? 'entity_mention',
              linkMode: mention?.linkMode ?? null,
            },
            updatedByUserId: userId,
            updatedAt: now,
          })
          .where(eq(relations.id, existingRow.id));
      }

      for (const [relationKey, entry] of relationEntries) {
        if (existingByKey.has(relationKey)) {
          continue;
        }

        const mention = entry.mention;

        await tx.insert(relations).values({
          id: randomUUID(),
          workspaceId: input.workspaceId,
          spaceId: input.spaceId,
          groupId: input.groupId,
          fromEntityId: entry.fromEntityId,
          toEntityId: entry.toEntityId,
          relationType: DOCUMENT_RELATION_TYPE,
          properties: {
            source: 'document_mention',
            sourceDocumentId: input.documentId,
            label: mention?.label ?? null,
            anchorId: mention?.anchorId ?? null,
            referenceKind: mention?.referenceKind ?? 'entity_mention',
            linkMode: mention?.linkMode ?? null,
          },
          createdByUserId: userId,
          updatedByUserId: userId,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
  }

  private async listSpaceDocuments(
    workspaceId: string,
    spaceId: string,
    groupId: string | null,
    excludeDocumentId?: string,
  ): Promise<DocumentRecord[]> {
    const db = this.getDb();
    const rows = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.workspaceId, workspaceId),
          eq(documents.spaceId, spaceId),
          groupId ? eq(documents.groupId, groupId) : isNull(documents.groupId),
        ),
      )
      .orderBy(desc(documents.updatedAt), asc(documents.createdAt));

    return rows
      .map(toDocumentRecord)
      .filter((document) => document.id !== excludeDocumentId);
  }

  private async updateLinkDefinitionText(
    userId: string,
    definition: DocumentLinkDefinition,
    nextText: string,
  ) {
    const db = this.getDb();
    const document = await db.query.documents.findFirst({
      where: eq(documents.id, definition.sourceDocumentId),
    });

    if (!document) {
      return;
    }

    const record = toDocumentRecord(document);
    let definitionUpdated = false;
    const nextBody = record.body.map((block) => {
      const targetsDefinition =
        block.id === definition.sourceBlockId ||
        block.entityReferences.some(
          (reference) =>
            reference.kind === 'document_link_definition' &&
            reference.linkKey === definition.key,
        ) ||
        (block.text ?? '').includes(definition.key);

      if (!targetsDefinition) {
        return block;
      }

      const text = replaceLinkTokenText(block.text ?? '', definition.key, definition.mode, nextText);

      if (text === (block.text ?? '')) {
        return block;
      }

      definitionUpdated = true;
      const entityReferences = block.entityReferences.map((reference) =>
        reference.kind === 'document_link_definition' && reference.linkKey === definition.key
          ? {
              ...reference,
              linkText: nextText,
            }
          : reference,
      );

      return {
        ...block,
        text: text.length > 0 ? text : null,
        entityReferences,
      };
    });

    if (!definitionUpdated) {
      return;
    }
    const previewText = buildPreviewText(nextBody);
    const now = new Date().toISOString();

    await db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({
          body: nextBody,
          previewText,
          updatedByUserId: userId,
          updatedAt: now,
        })
        .where(eq(documents.id, record.id));

      await tx
        .update(entities)
        .set({
          summary: previewText,
          updatedByUserId: userId,
          updatedAt: now,
        })
        .where(eq(entities.id, record.entityId));
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

  private async requireDocumentAccess(
    userId: string,
    documentId: string,
    permission: 'read' | 'edit' | 'manage' = 'read',
  ): Promise<DocumentRow> {
    const db = this.getDb();
    const document = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
    });

    if (!document) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Document not found');
    }

    await this.workspacesService.requirePermission(userId, document.workspaceId, permission);

    return document;
  }

  private async requireEntityAccess(
    userId: string,
    entityId: string,
    permission: 'read' | 'edit' | 'manage' = 'read',
  ): Promise<EntityRow> {
    const entity = await this.requireEntityByWorkspace(null, entityId);
    await this.workspacesService.requirePermission(userId, entity.workspaceId, permission);
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

  private async requireSpaceAccess(
    userId: string,
    spaceId: string,
    permission: 'read' | 'edit' | 'manage' = 'read',
  ): Promise<SpaceRow> {
    const db = this.getDb();
    const space = await db.query.spaces.findFirst({
      where: eq(spaces.id, spaceId),
    });

    if (!space) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Space not found');
    }

    await this.workspacesService.requirePermission(userId, space.workspaceId, permission);

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
  let normalized = replaceDocumentLinkTokensForPreview(text);

  for (const reference of references) {
    if (
      reference.kind !== 'document_link_usage' ||
      reference.linkMode !== 'static' ||
      !reference.linkKey ||
      typeof reference.linkText !== 'string'
    ) {
      continue;
    }

    const pattern = new RegExp(
      `(^|[^A-Za-z0-9_-])(${escapeRegExp(reference.linkKey)})\\b(?!\\*\\*|\\$\\$)`,
      'g',
    );

    normalized = normalized.replace(pattern, (_, prefix: string) => `${prefix}${reference.linkText}`);
  }

  for (const reference of references) {
    if (reference.kind === 'document_link_definition' || reference.kind === 'document_link_usage') {
      continue;
    }

    const pattern = new RegExp(
      String.raw`\[\[entity:${escapeRegExp(reference.entityId)}(?:\|[^\]]+)?\]\]`,
      'g',
    );

    normalized = normalized.replace(pattern, reference.label ?? reference.entityId);
  }

  return normalized;
};

const replaceBareLinkKeysFromDefinitions = (
  text: string,
  definitionMap: Map<string, DocumentLinkDefinition>,
  currentDocumentId: string,
) => {
  let nextText = text;
  const definitions = Array.from(definitionMap.values())
    .filter((definition) => definition.sourceDocumentId !== currentDocumentId)
    .sort((left, right) => right.key.length - left.key.length);

  for (const definition of definitions) {
    const pattern = new RegExp(
      `(^|[^A-Za-z0-9_-])(${escapeRegExp(definition.key)})\\b(?!\\*\\*|\\$\\$)`,
      'g',
    );

    nextText = nextText.replace(pattern, (_, prefix: string) => {
      return definition.mode === 'sync'
        ? `${prefix}${buildDocumentLinkToken({
            key: definition.key,
            mode: definition.mode,
            text: definition.text,
          })}`
        : `${prefix}${definition.key}`;
    });
  }

  return nextText;
};

const findStaticBareUsageDefinitions = (
  text: string,
  definitionMap: Map<string, DocumentLinkDefinition>,
  currentDocumentId: string,
) => {
  const definitions = Array.from(definitionMap.values())
    .filter(
      (definition) =>
        definition.mode === 'static' && definition.sourceDocumentId !== currentDocumentId,
    )
    .sort((left, right) => right.key.length - left.key.length);
  const occupiedRanges = extractDocumentLinkTokens(text).map((token) => ({
    start: token.start,
    end: token.end,
  }));
  const matches: DocumentLinkDefinition[] = [];

  for (const definition of definitions) {
    const pattern = new RegExp(
      `(^|[^A-Za-z0-9_-])(${escapeRegExp(definition.key)})\\b(?!\\*\\*|\\$\\$)`,
      'g',
    );

    for (const match of text.matchAll(pattern)) {
      const prefix = match[1] ?? '';
      const key = match[2];
      const matchIndex = match.index ?? -1;

      if (!key || matchIndex < 0) {
        continue;
      }

      const start = matchIndex + prefix.length;
      const end = start + key.length;
      const overlaps = occupiedRanges.some((range) => start < range.end && end > range.start);

      if (overlaps) {
        continue;
      }

      occupiedRanges.push({ start, end });
      matches.push(definition);
    }
  }

  return matches;
};

const findTokenText = (text: string, key: string) =>
  extractDocumentLinkTokens(text).find((token) => token.key === key)?.text ?? null;

const replaceLinkTokenText = (
  text: string,
  key: string,
  mode: DocumentLinkDefinition['mode'],
  nextText: string,
) =>
  text.replace(
    new RegExp(
      `${escapeRegExp(key)}(?:\\*\\*[\\s\\S]*?\\*\\*|\\$\\$[\\s\\S]*?\\$\\$)`,
      'g',
    ),
    () =>
      buildDocumentLinkToken({
        key,
        mode,
        text: nextText,
      }),
  );

const resolveDefinitionFromReference = (
  reference: DocumentEntityReference,
  definitionMap: Map<string, DocumentLinkDefinition>,
) => {
  if (reference.sourceDocumentId) {
    for (const definition of definitionMap.values()) {
      if (
        definition.sourceDocumentId === reference.sourceDocumentId &&
        (!reference.linkKey || definition.key === reference.linkKey)
      ) {
        return definition;
      }
    }
  }

  return reference.linkKey ? definitionMap.get(reference.linkKey) ?? null : null;
};

const extractSourceDocumentId = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const properties = value as Record<string, unknown>;

  return typeof properties.sourceDocumentId === 'string' ? properties.sourceDocumentId : null;
};
