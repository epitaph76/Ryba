import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { z } from 'zod';
import {
  createEntityTypeRequestSchema,
  entityTypeIdParamsSchema,
  updateEntityTypeRequestSchema,
  workspaceIdParamsSchema,
} from '@ryba/schemas';
import type { EntityTypeFieldRecord, EntityTypeRecord } from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import { toEntityTypeFieldRecord, toEntityTypeRecord } from '../db/mappers';
import { entityTypeFields, entityTypes } from '../db/schema';
import {
  EntityValidationError,
  normalizeEntityProperties,
  normalizeFieldConfig,
} from './entity-value';
import { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

type WorkspaceIdParams = z.infer<typeof workspaceIdParamsSchema>;
type EntityTypeIdParams = z.infer<typeof entityTypeIdParamsSchema>;
type CreateEntityTypeRequest = z.infer<typeof createEntityTypeRequestSchema>;
type UpdateEntityTypeRequest = z.infer<typeof updateEntityTypeRequestSchema>;

@Injectable()
export class EntityTypesService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(WorkspaceActivityService)
    private readonly workspaceActivityService: WorkspaceActivityService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
  ) {}

  async listEntityTypes(
    userId: string,
    params: WorkspaceIdParams,
  ): Promise<EntityTypeRecord[]> {
    await this.workspacesService.requirePermission(userId, params.workspaceId, 'read');
    return this.loadWorkspaceEntityTypes(params.workspaceId);
  }

  async createEntityType(
    userId: string,
    params: WorkspaceIdParams,
    payload: CreateEntityTypeRequest,
  ): Promise<EntityTypeRecord> {
    const db = this.getDb();
    await this.workspacesService.requirePermission(userId, params.workspaceId, 'manage');
    const slug = payload.slug.trim().toLowerCase();

    await this.ensureUniqueSlug(params.workspaceId, slug);

    const entityTypeId = randomUUID();
    const fieldRows = this.buildFieldRows(params.workspaceId, entityTypeId, payload.fields);

    await db.transaction(async (tx) => {
      await tx.insert(entityTypes).values({
        id: entityTypeId,
        workspaceId: params.workspaceId,
        name: payload.name.trim(),
        slug,
        description: payload.description ?? null,
        color: payload.color ?? null,
        icon: payload.icon ?? null,
        isSystem: false,
      });

      if (fieldRows.length > 0) {
        await tx.insert(entityTypeFields).values(fieldRows);
      }
    });

    const entityType = await this.requireEntityTypeWithFields(entityTypeId);

    await this.workspaceActivityService.recordEvent({
      workspaceId: entityType.workspaceId,
      actorUserId: userId,
      eventType: 'entity_type.created',
      targetType: 'entity_type',
      targetId: entityType.id,
      summary: `Entity type created: ${entityType.name}`,
      metadata: {
        slug: entityType.slug,
      },
    });

    return entityType;
  }

  async updateEntityType(
    userId: string,
    params: EntityTypeIdParams,
    payload: UpdateEntityTypeRequest,
  ): Promise<EntityTypeRecord> {
    const db = this.getDb();
    const current = await this.requireEntityTypeRow(userId, params.entityTypeId);
    const nextSlug = payload.slug?.trim().toLowerCase();

    if (nextSlug && nextSlug !== current.slug) {
      await this.ensureUniqueSlug(current.workspaceId, nextSlug, current.id);
    }

    await db.transaction(async (tx) => {
      await tx
        .update(entityTypes)
        .set({
          ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
          ...(nextSlug !== undefined ? { slug: nextSlug } : {}),
          ...(payload.description !== undefined ? { description: payload.description } : {}),
          ...(payload.color !== undefined ? { color: payload.color } : {}),
          ...(payload.icon !== undefined ? { icon: payload.icon } : {}),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(entityTypes.id, current.id));

      if (payload.fields !== undefined) {
        await tx.delete(entityTypeFields).where(eq(entityTypeFields.entityTypeId, current.id));

        const fieldRows = this.buildFieldRows(current.workspaceId, current.id, payload.fields);

        if (fieldRows.length > 0) {
          await tx.insert(entityTypeFields).values(fieldRows);
        }
      }
    });

    const entityType = await this.requireEntityTypeWithFields(current.id);

    await this.workspaceActivityService.recordEvent({
      workspaceId: entityType.workspaceId,
      actorUserId: userId,
      eventType: 'entity_type.updated',
      targetType: 'entity_type',
      targetId: entityType.id,
      summary: `Entity type updated: ${entityType.name}`,
      metadata: {
        slug: entityType.slug,
      },
    });

    return entityType;
  }

  async resolveEntityTypeForWorkspace(
    workspaceId: string,
    entityTypeId: string | null | undefined,
  ): Promise<EntityTypeRecord | null> {
    if (entityTypeId) {
      const record = await this.requireEntityTypeWithFields(entityTypeId);

      if (record.workspaceId !== workspaceId) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Entity type must belong to the same workspace',
        );
      }

      return record;
    }

    return this.findDefaultEntityType(workspaceId);
  }

  validateEntityPropertiesForType(
    entityType: EntityTypeRecord | null,
    properties: unknown,
  ) {
    if (!entityType) {
      return isJsonObject(properties) ? properties : {};
    }

    try {
      return normalizeEntityProperties(entityType.fields, properties);
    } catch (error) {
      if (error instanceof EntityValidationError) {
        throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', error.message);
      }

      throw error;
    }
  }

  async requireEntityTypeWithFields(entityTypeId: string): Promise<EntityTypeRecord> {
    const db = this.getDb();
    const row = await db.query.entityTypes.findFirst({
      where: eq(entityTypes.id, entityTypeId),
    });

    if (!row) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Entity type not found');
    }

    const [fields] = await Promise.all([
      db
        .select()
        .from(entityTypeFields)
        .where(eq(entityTypeFields.entityTypeId, row.id))
        .orderBy(asc(entityTypeFields.order), asc(entityTypeFields.createdAt)),
    ]);

    return toEntityTypeRecord(row, fields.map(toEntityTypeFieldRecord));
  }

  private async findDefaultEntityType(workspaceId: string): Promise<EntityTypeRecord | null> {
    const db = this.getDb();
    const row = await db.query.entityTypes.findFirst({
      where: and(eq(entityTypes.workspaceId, workspaceId), eq(entityTypes.slug, 'note')),
    });

    if (!row) {
      return null;
    }

    return this.requireEntityTypeWithFields(row.id);
  }

  private async loadWorkspaceEntityTypes(workspaceId: string): Promise<EntityTypeRecord[]> {
    const db = this.getDb();
    const [typeRows, fieldRows] = await Promise.all([
      db
        .select()
        .from(entityTypes)
        .where(eq(entityTypes.workspaceId, workspaceId))
        .orderBy(asc(entityTypes.name)),
      db
        .select()
        .from(entityTypeFields)
        .where(eq(entityTypeFields.workspaceId, workspaceId))
        .orderBy(asc(entityTypeFields.order), asc(entityTypeFields.createdAt)),
    ]);

    const fieldsByTypeId = new Map<string, EntityTypeFieldRecord[]>();

    for (const row of fieldRows) {
      const current = fieldsByTypeId.get(row.entityTypeId) ?? [];
      current.push(toEntityTypeFieldRecord(row));
      fieldsByTypeId.set(row.entityTypeId, current);
    }

    return typeRows.map((row) => toEntityTypeRecord(row, fieldsByTypeId.get(row.id) ?? []));
  }

  private buildFieldRows(
    workspaceId: string,
    entityTypeId: string,
    fields: CreateEntityTypeRequest['fields'],
  ) {
    const seenKeys = new Set<string>();

    return fields.map((field, index) => {
      const key = field.key.trim().toLowerCase();

      if (seenKeys.has(key)) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          `Field key "${key}" must be unique inside the entity type`,
        );
      }

      seenKeys.add(key);

      return {
        id: randomUUID(),
        workspaceId,
        entityTypeId,
        key,
        label: field.label.trim(),
        fieldType: field.fieldType,
        description: field.description ?? null,
        required: field.required ?? false,
        order: index,
        config: normalizeFieldConfig(field.fieldType, field.config),
      };
    });
  }

  private async requireEntityTypeRow(userId: string, entityTypeId: string) {
    const db = this.getDb();
    const row = await db.query.entityTypes.findFirst({
      where: eq(entityTypes.id, entityTypeId),
    });

    if (!row) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Entity type not found');
    }

    await this.workspacesService.requirePermission(userId, row.workspaceId, 'manage');

    return row;
  }

  private async ensureUniqueSlug(
    workspaceId: string,
    slug: string,
    excludeEntityTypeId?: string,
  ) {
    const db = this.getDb();
    const existing = await db.query.entityTypes.findFirst({
      where:
        excludeEntityTypeId === undefined
          ? and(eq(entityTypes.workspaceId, workspaceId), eq(entityTypes.slug, slug))
          : and(
              eq(entityTypes.workspaceId, workspaceId),
              eq(entityTypes.slug, slug),
              ne(entityTypes.id, excludeEntityTypeId),
            ),
    });

    if (existing) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'Entity type with this slug already exists in workspace',
      );
    }
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

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
