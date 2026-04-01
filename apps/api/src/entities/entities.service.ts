import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import {
  createEntityRequestSchema,
  entityIdParamsSchema,
  spaceIdParamsSchema,
  updateEntityRequestSchema,
} from '@ryba/schemas';
import type { EntityRecord } from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import { toEntityRecord } from '../db/mappers';
import { entities, spaces } from '../db/schema';
import { EntityTypesService } from '../entity-types/entity-types.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type EntityIdParams = z.infer<typeof entityIdParamsSchema>;
type CreateEntityRequest = z.infer<typeof createEntityRequestSchema>;
type UpdateEntityRequest = z.infer<typeof updateEntityRequestSchema>;

@Injectable()
export class EntitiesService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(EntityTypesService)
    private readonly entityTypesService: EntityTypesService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
  ) {}

  async createEntity(
    userId: string,
    params: SpaceIdParams,
    payload: CreateEntityRequest,
  ): Promise<EntityRecord> {
    const db = this.getDb();
    const space = await this.requireSpaceAccess(userId, params.spaceId);
    const entityType = await this.entityTypesService.resolveEntityTypeForWorkspace(
      space.workspaceId,
      payload.entityTypeId,
    );
    const properties = this.entityTypesService.validateEntityPropertiesForType(
      entityType,
      payload.properties ?? {},
    );

    const [insertedEntity] = await db
      .insert(entities)
      .values({
        id: randomUUID(),
        workspaceId: space.workspaceId,
        spaceId: space.id,
        entityTypeId: entityType?.id ?? null,
        title: payload.title.trim(),
        summary: payload.summary ?? null,
        properties,
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .returning();

    return toEntityRecord(insertedEntity);
  }

  async listEntities(
    userId: string,
    params: SpaceIdParams,
  ): Promise<EntityRecord[]> {
    const db = this.getDb();
    const space = await this.requireSpaceAccess(userId, params.spaceId);

    const rows = await db
      .select()
      .from(entities)
      .where(and(eq(entities.workspaceId, space.workspaceId), eq(entities.spaceId, space.id)))
      .orderBy(asc(entities.createdAt));

    return rows.map(toEntityRecord);
  }

  async getEntity(userId: string, params: EntityIdParams): Promise<EntityRecord> {
    const entity = await this.requireEntityAccess(userId, params.entityId);

    return toEntityRecord(entity);
  }

  async updateEntity(
    userId: string,
    params: EntityIdParams,
    payload: UpdateEntityRequest,
  ): Promise<EntityRecord> {
    const db = this.getDb();
    const entity = await this.requireEntityAccess(userId, params.entityId);
    const nextEntityType = await this.entityTypesService.resolveEntityTypeForWorkspace(
      entity.workspaceId,
      payload.entityTypeId === undefined ? entity.entityTypeId : payload.entityTypeId,
    );
    const nextProperties =
      payload.properties !== undefined || payload.entityTypeId !== undefined
        ? this.entityTypesService.validateEntityPropertiesForType(
            nextEntityType,
            payload.properties ?? entity.properties,
          )
        : undefined;

    const [updatedEntity] = await db
      .update(entities)
      .set({
        ...(payload.entityTypeId !== undefined ? { entityTypeId: nextEntityType?.id ?? null } : {}),
        ...(payload.title !== undefined ? { title: payload.title.trim() } : {}),
        ...(payload.summary !== undefined ? { summary: payload.summary } : {}),
        ...(nextProperties !== undefined ? { properties: nextProperties } : {}),
        updatedByUserId: userId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(entities.id, entity.id))
      .returning();

    return toEntityRecord(updatedEntity);
  }

  async deleteEntity(userId: string, params: EntityIdParams): Promise<{ id: string }> {
    const db = this.getDb();
    const entity = await this.requireEntityAccess(userId, params.entityId);

    await db.delete(entities).where(eq(entities.id, entity.id));

    return {
      id: entity.id,
    };
  }

  async requireEntityAccess(userId: string, entityId: string): Promise<typeof entities.$inferSelect> {
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

  private async requireSpaceAccess(userId: string, spaceId: string): Promise<typeof spaces.$inferSelect> {
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
