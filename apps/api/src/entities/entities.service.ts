import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { z } from 'zod';
import {
  createEntityRequestSchema,
  entityIdParamsSchema,
  groupIdParamsSchema,
  spaceIdParamsSchema,
  updateEntityRequestSchema,
} from '@ryba/schemas';
import type { EntityRecord } from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import { toEntityRecord } from '../db/mappers';
import { entities, spaces } from '../db/schema';
import { EntityTypesService } from '../entity-types/entity-types.service';
import { GroupsService } from '../groups/groups.service';
import { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type GroupIdParams = z.infer<typeof groupIdParamsSchema>;
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
    @Inject(GroupsService)
    private readonly groupsService: GroupsService,
    @Inject(WorkspaceActivityService)
    private readonly workspaceActivityService: WorkspaceActivityService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
  ) {}

  async createEntity(
    userId: string,
    params: SpaceIdParams,
    payload: CreateEntityRequest,
  ): Promise<EntityRecord> {
    const space = await this.requireSpaceAccess(userId, params.spaceId, 'edit');

    return this.createEntityInScope(
      userId,
      {
        workspaceId: space.workspaceId,
        spaceId: space.id,
        groupId: null,
      },
      payload,
    );
  }

  async createGroupEntity(
    userId: string,
    params: GroupIdParams,
    payload: CreateEntityRequest,
  ): Promise<EntityRecord> {
    const group = await this.groupsService.requireGroupAccess(userId, params.groupId, 'edit');

    return this.createEntityInScope(
      userId,
      {
        workspaceId: group.workspaceId,
        spaceId: group.spaceId,
        groupId: group.id,
      },
      payload,
    );
  }

  async listEntities(
    userId: string,
    params: SpaceIdParams,
  ): Promise<EntityRecord[]> {
    const space = await this.requireSpaceAccess(userId, params.spaceId, 'read');

    return this.listEntitiesInScope(userId, {
      workspaceId: space.workspaceId,
      spaceId: space.id,
      groupId: null,
    });
  }

  async listGroupEntities(userId: string, params: GroupIdParams): Promise<EntityRecord[]> {
    const group = await this.groupsService.requireGroupAccess(userId, params.groupId, 'read');

    return this.listEntitiesInScope(userId, {
      workspaceId: group.workspaceId,
      spaceId: group.spaceId,
      groupId: group.id,
    });
  }

  async getEntity(userId: string, params: EntityIdParams): Promise<EntityRecord> {
    const entity = await this.requireEntityAccess(userId, params.entityId, 'read');

    return toEntityRecord(entity);
  }

  async updateEntity(
    userId: string,
    params: EntityIdParams,
    payload: UpdateEntityRequest,
  ): Promise<EntityRecord> {
    const db = this.getDb();
    const entity = await this.requireEntityAccess(userId, params.entityId, 'edit');
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

    await this.workspaceActivityService.recordEvent({
      workspaceId: updatedEntity.workspaceId,
      spaceId: updatedEntity.spaceId,
      groupId: updatedEntity.groupId,
      actorUserId: userId,
      eventType: 'entity.updated',
      targetType: 'entity',
      targetId: updatedEntity.id,
      summary: `Entity updated: ${updatedEntity.title}`,
      metadata: {
        entityTypeId: updatedEntity.entityTypeId,
      },
    });

    return toEntityRecord(updatedEntity);
  }

  async deleteEntity(userId: string, params: EntityIdParams): Promise<{ id: string }> {
    const db = this.getDb();
    const entity = await this.requireEntityAccess(userId, params.entityId, 'edit');

    await db.delete(entities).where(eq(entities.id, entity.id));

    await this.workspaceActivityService.recordEvent({
      workspaceId: entity.workspaceId,
      spaceId: entity.spaceId,
      groupId: entity.groupId,
      actorUserId: userId,
      eventType: 'entity.deleted',
      targetType: 'entity',
      targetId: entity.id,
      summary: `Entity deleted: ${entity.title}`,
      metadata: {
        entityTypeId: entity.entityTypeId,
      },
    });

    return {
      id: entity.id,
    };
  }

  async requireEntityAccess(
    userId: string,
    entityId: string,
    permission: 'read' | 'edit' | 'manage' = 'read',
  ): Promise<typeof entities.$inferSelect> {
    const db = this.getDb();

    const entity = await db.query.entities.findFirst({
      where: eq(entities.id, entityId),
    });

    if (!entity) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Entity not found');
    }

    await this.workspacesService.requirePermission(userId, entity.workspaceId, permission);

    return entity;
  }

  private async requireSpaceAccess(
    userId: string,
    spaceId: string,
    permission: 'read' | 'edit' | 'manage' = 'read',
  ): Promise<typeof spaces.$inferSelect> {
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

  private async createEntityInScope(
    userId: string,
    scope: {
      workspaceId: string;
      spaceId: string;
      groupId: string | null;
    },
    payload: CreateEntityRequest,
  ): Promise<EntityRecord> {
    const db = this.getDb();
    const entityType = await this.entityTypesService.resolveEntityTypeForWorkspace(
      scope.workspaceId,
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
        workspaceId: scope.workspaceId,
        spaceId: scope.spaceId,
        groupId: scope.groupId,
        entityTypeId: entityType?.id ?? null,
        title: payload.title.trim(),
        summary: payload.summary ?? null,
        properties,
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .returning();

    await this.workspaceActivityService.recordEvent({
      workspaceId: insertedEntity.workspaceId,
      spaceId: insertedEntity.spaceId,
      groupId: insertedEntity.groupId,
      actorUserId: userId,
      eventType: 'entity.created',
      targetType: 'entity',
      targetId: insertedEntity.id,
      summary: `Entity created: ${insertedEntity.title}`,
      metadata: {
        entityTypeId: insertedEntity.entityTypeId,
      },
    });

    return toEntityRecord(insertedEntity);
  }

  private async listEntitiesInScope(
    userId: string,
    scope: {
      workspaceId: string;
      spaceId: string;
      groupId: string | null;
    },
  ): Promise<EntityRecord[]> {
    const db = this.getDb();
    await this.workspacesService.requirePermission(userId, scope.workspaceId, 'read');

    const rows = await db
      .select()
      .from(entities)
      .where(
        and(
          eq(entities.workspaceId, scope.workspaceId),
          eq(entities.spaceId, scope.spaceId),
          scope.groupId ? eq(entities.groupId, scope.groupId) : isNull(entities.groupId),
        ),
      )
      .orderBy(asc(entities.createdAt));

    return rows.map(toEntityRecord);
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
