import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { z } from 'zod';
import {
  createRelationRequestSchema,
  groupIdParamsSchema,
  relationIdParamsSchema,
  spaceIdParamsSchema,
  updateRelationRequestSchema,
} from '@ryba/schemas';
import type { RelationRecord } from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import { toRelationRecord } from '../db/mappers';
import { entities, relations, spaces } from '../db/schema';
import { GroupsService } from '../groups/groups.service';
import { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type GroupIdParams = z.infer<typeof groupIdParamsSchema>;
type RelationIdParams = z.infer<typeof relationIdParamsSchema>;
type CreateRelationRequest = z.infer<typeof createRelationRequestSchema>;
type UpdateRelationRequest = z.infer<typeof updateRelationRequestSchema>;

@Injectable()
export class RelationsService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(GroupsService)
    private readonly groupsService: GroupsService,
    @Inject(WorkspaceActivityService)
    private readonly workspaceActivityService: WorkspaceActivityService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
  ) {}

  async createRelation(
    userId: string,
    params: SpaceIdParams,
    payload: CreateRelationRequest,
  ): Promise<RelationRecord> {
    const space = await this.requireSpaceAccess(userId, params.spaceId, 'edit');

    return this.createRelationInScope(
      userId,
      {
        workspaceId: space.workspaceId,
        spaceId: space.id,
        groupId: null,
      },
      payload,
    );
  }

  async createGroupRelation(
    userId: string,
    params: GroupIdParams,
    payload: CreateRelationRequest,
  ): Promise<RelationRecord> {
    const group = await this.groupsService.requireGroupAccess(userId, params.groupId, 'edit');

    return this.createRelationInScope(
      userId,
      {
        workspaceId: group.workspaceId,
        spaceId: group.spaceId,
        groupId: group.id,
      },
      payload,
    );
  }

  async listRelations(
    userId: string,
    params: SpaceIdParams,
  ): Promise<RelationRecord[]> {
    const space = await this.requireSpaceAccess(userId, params.spaceId, 'read');

    return this.listRelationsInScope(userId, {
      workspaceId: space.workspaceId,
      spaceId: space.id,
      groupId: null,
    });
  }

  async listGroupRelations(userId: string, params: GroupIdParams): Promise<RelationRecord[]> {
    const group = await this.groupsService.requireGroupAccess(userId, params.groupId, 'read');

    return this.listRelationsInScope(userId, {
      workspaceId: group.workspaceId,
      spaceId: group.spaceId,
      groupId: group.id,
    });
  }

  async updateRelation(
    userId: string,
    params: RelationIdParams,
    payload: UpdateRelationRequest,
  ): Promise<RelationRecord> {
    const db = this.getDb();
    const relation = await this.requireRelationAccess(userId, params.relationId, 'edit');

    const [updatedRelation] = await db
      .update(relations)
      .set({
        ...(payload.relationType !== undefined
          ? { relationType: payload.relationType.trim() }
          : {}),
        ...(payload.properties !== undefined ? { properties: payload.properties } : {}),
        updatedByUserId: userId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(relations.id, relation.id))
      .returning();

    await this.workspaceActivityService.recordEvent({
      workspaceId: updatedRelation.workspaceId,
      spaceId: updatedRelation.spaceId,
      groupId: updatedRelation.groupId,
      actorUserId: userId,
      eventType: 'relation.updated',
      targetType: 'relation',
      targetId: updatedRelation.id,
      summary: `Relation updated: ${updatedRelation.relationType}`,
      metadata: {
        fromEntityId: updatedRelation.fromEntityId,
        toEntityId: updatedRelation.toEntityId,
      },
    });

    return toRelationRecord(updatedRelation);
  }

  async deleteRelation(
    userId: string,
    params: RelationIdParams,
  ): Promise<{ id: string }> {
    const db = this.getDb();
    const relation = await this.requireRelationAccess(userId, params.relationId, 'edit');

    await db.delete(relations).where(eq(relations.id, relation.id));

    await this.workspaceActivityService.recordEvent({
      workspaceId: relation.workspaceId,
      spaceId: relation.spaceId,
      groupId: relation.groupId,
      actorUserId: userId,
      eventType: 'relation.deleted',
      targetType: 'relation',
      targetId: relation.id,
      summary: `Relation deleted: ${relation.relationType}`,
      metadata: {
        fromEntityId: relation.fromEntityId,
        toEntityId: relation.toEntityId,
      },
    });

    return {
      id: relation.id,
    };
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

  private async createRelationInScope(
    userId: string,
    scope: {
      workspaceId: string;
      spaceId: string;
      groupId: string | null;
    },
    payload: CreateRelationRequest,
  ): Promise<RelationRecord> {
    const db = this.getDb();

    if (payload.fromEntityId === payload.toEntityId) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Relation endpoints must be different entities',
      );
    }

    const [fromEntity, toEntity] = await Promise.all([
      db.query.entities.findFirst({
        where: eq(entities.id, payload.fromEntityId),
      }),
      db.query.entities.findFirst({
        where: eq(entities.id, payload.toEntityId),
      }),
    ]);

    if (!fromEntity || !toEntity) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Relation entities must exist',
      );
    }

    const endpointsBelongToScope =
      fromEntity.workspaceId === scope.workspaceId &&
      toEntity.workspaceId === scope.workspaceId &&
      fromEntity.spaceId === scope.spaceId &&
      toEntity.spaceId === scope.spaceId &&
      fromEntity.groupId === scope.groupId &&
      toEntity.groupId === scope.groupId;

    if (!endpointsBelongToScope) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Both entities must belong to the same workspace, space and group context',
      );
    }

    const [insertedRelation] = await db
      .insert(relations)
      .values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        spaceId: scope.spaceId,
        groupId: scope.groupId,
        fromEntityId: payload.fromEntityId,
        toEntityId: payload.toEntityId,
        relationType: payload.relationType.trim(),
        properties: payload.properties ?? {},
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .returning();

    await this.workspaceActivityService.recordEvent({
      workspaceId: insertedRelation.workspaceId,
      spaceId: insertedRelation.spaceId,
      groupId: insertedRelation.groupId,
      actorUserId: userId,
      eventType: 'relation.created',
      targetType: 'relation',
      targetId: insertedRelation.id,
      summary: `Relation created: ${insertedRelation.relationType}`,
      metadata: {
        fromEntityId: insertedRelation.fromEntityId,
        toEntityId: insertedRelation.toEntityId,
      },
    });

    return toRelationRecord(insertedRelation);
  }

  private async listRelationsInScope(
    userId: string,
    scope: {
      workspaceId: string;
      spaceId: string;
      groupId: string | null;
    },
  ): Promise<RelationRecord[]> {
    const db = this.getDb();
    await this.workspacesService.requirePermission(userId, scope.workspaceId, 'read');

    const rows = await db
      .select()
      .from(relations)
      .where(
        and(
          eq(relations.workspaceId, scope.workspaceId),
          eq(relations.spaceId, scope.spaceId),
          scope.groupId ? eq(relations.groupId, scope.groupId) : isNull(relations.groupId),
        ),
      )
      .orderBy(asc(relations.createdAt));

    return rows.map(toRelationRecord);
  }

  private async requireRelationAccess(
    userId: string,
    relationId: string,
    permission: 'read' | 'edit' | 'manage' = 'read',
  ): Promise<typeof relations.$inferSelect> {
    const db = this.getDb();
    const relation = await db.query.relations.findFirst({
      where: eq(relations.id, relationId),
    });

    if (!relation) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Relation not found');
    }

    await this.workspacesService.requirePermission(userId, relation.workspaceId, permission);

    return relation;
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
