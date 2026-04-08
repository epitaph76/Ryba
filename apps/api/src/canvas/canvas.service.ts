import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { z } from 'zod';
import {
  groupIdParamsSchema,
  saveCanvasStateRequestSchema,
  spaceIdParamsSchema,
} from '@ryba/schemas';
import type { CanvasNodeLayout, CanvasStateRecord } from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import { toCanvasStateRecord } from '../db/mappers';
import {
  entities,
  groupCanvasStates,
  relations,
  spaceCanvasStates,
  spaces,
} from '../db/schema';
import { GroupsService } from '../groups/groups.service';
import { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type GroupIdParams = z.infer<typeof groupIdParamsSchema>;
type SaveCanvasStateRequest = z.infer<typeof saveCanvasStateRequestSchema>;
type EntityRow = typeof entities.$inferSelect;
type RelationRow = typeof relations.$inferSelect;

@Injectable()
export class CanvasService {
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

  async getCanvasState(
    userId: string,
    params: SpaceIdParams,
  ): Promise<CanvasStateRecord> {
    const space = await this.requireSpaceAccess(userId, params.spaceId, 'read');

    return this.getCanvasStateInScope(userId, {
      workspaceId: space.workspaceId,
      spaceId: space.id,
      groupId: null,
    });
  }

  async getGroupCanvasState(
    userId: string,
    params: GroupIdParams,
  ): Promise<CanvasStateRecord> {
    const group = await this.groupsService.requireGroupAccess(userId, params.groupId, 'read');

    return this.getCanvasStateInScope(userId, {
      workspaceId: group.workspaceId,
      spaceId: group.spaceId,
      groupId: group.id,
    });
  }

  async saveCanvasState(
    userId: string,
    params: SpaceIdParams,
    payload: SaveCanvasStateRequest,
  ): Promise<CanvasStateRecord> {
    const space = await this.requireSpaceAccess(userId, params.spaceId, 'edit');

    return this.saveCanvasStateInScope(
      userId,
      {
        workspaceId: space.workspaceId,
        spaceId: space.id,
        groupId: null,
      },
      payload,
    );
  }

  async saveGroupCanvasState(
    userId: string,
    params: GroupIdParams,
    payload: SaveCanvasStateRequest,
  ): Promise<CanvasStateRecord> {
    const group = await this.groupsService.requireGroupAccess(userId, params.groupId, 'edit');

    return this.saveCanvasStateInScope(
      userId,
      {
        workspaceId: group.workspaceId,
        spaceId: group.spaceId,
        groupId: group.id,
      },
      payload,
    );
  }

  private validateLayout(
    payload: SaveCanvasStateRequest,
    spaceEntities: EntityRow[],
    spaceRelations: RelationRow[],
  ): void {
    const entityIds = new Set(spaceEntities.map((entity) => entity.id));
    const relationById = new Map(spaceRelations.map((relation) => [relation.id, relation]));

    for (const node of payload.nodes) {
      if (!entityIds.has(node.entityId)) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          `Canvas node references missing entity ${node.entityId}`,
        );
      }
    }

    for (const edge of payload.edges) {
      const relation = relationById.get(edge.relationId);

      if (!relation) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          `Canvas edge references missing relation ${edge.relationId}`,
        );
      }

      if (
        relation.fromEntityId !== edge.fromEntityId ||
        relation.toEntityId !== edge.toEntityId
      ) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          `Canvas edge endpoints do not match relation ${edge.relationId}`,
        );
      }
    }
  }

  private resolveCanvasState(
    spaceId: string,
    groupId: string | null,
    spaceEntities: EntityRow[],
    spaceRelations: RelationRow[],
    persisted: CanvasStateRecord | null,
  ): CanvasStateRecord {
    const persistedNodes = new Map(
      (persisted?.nodes ?? []).map((node) => [node.entityId, node]),
    );
    const persistedEdges = new Map(
      (persisted?.edges ?? []).map((edge) => [edge.relationId, edge]),
    );

    return {
      spaceId,
      groupId,
      nodes: spaceEntities.map((entity, index) => {
        return persistedNodes.get(entity.id) ?? this.createDefaultNode(entity.id, index);
      }),
      edges: spaceRelations.map((relation) => {
        return (
          persistedEdges.get(relation.id) ?? {
            relationId: relation.id,
            fromEntityId: relation.fromEntityId,
            toEntityId: relation.toEntityId,
            controlPoints: [],
          }
        );
      }),
      viewport: persisted?.viewport ?? {
        zoom: 1,
        offset: {
          x: 0,
          y: 0,
        },
      },
      updatedAt: persisted?.updatedAt ?? null,
    };
  }

  private async getCanvasStateInScope(
    userId: string,
    scope: {
      workspaceId: string;
      spaceId: string;
      groupId: string | null;
    },
  ): Promise<CanvasStateRecord> {
    const db = this.getDb();
    await this.workspacesService.requirePermission(userId, scope.workspaceId, 'read');
    const [scopeEntities, scopeRelations, state] = await Promise.all([
      db
        .select()
        .from(entities)
        .where(
          and(
            eq(entities.workspaceId, scope.workspaceId),
            eq(entities.spaceId, scope.spaceId),
            scope.groupId ? eq(entities.groupId, scope.groupId) : isNull(entities.groupId),
          ),
        )
        .orderBy(asc(entities.createdAt)),
      db
        .select()
        .from(relations)
        .where(
          and(
            eq(relations.workspaceId, scope.workspaceId),
            eq(relations.spaceId, scope.spaceId),
            scope.groupId ? eq(relations.groupId, scope.groupId) : isNull(relations.groupId),
          ),
        )
        .orderBy(asc(relations.createdAt)),
      scope.groupId
        ? db.query.groupCanvasStates.findFirst({
            where: eq(groupCanvasStates.groupId, scope.groupId),
          })
        : db.query.spaceCanvasStates.findFirst({
            where: eq(spaceCanvasStates.spaceId, scope.spaceId),
          }),
    ]);

    return this.resolveCanvasState(
      scope.spaceId,
      scope.groupId,
      scopeEntities,
      scopeRelations,
      state ? toCanvasStateRecord(state, scope) : null,
    );
  }

  private async saveCanvasStateInScope(
    userId: string,
    scope: {
      workspaceId: string;
      spaceId: string;
      groupId: string | null;
    },
    payload: SaveCanvasStateRequest,
  ): Promise<CanvasStateRecord> {
    const db = this.getDb();
    await this.workspacesService.requirePermission(userId, scope.workspaceId, 'edit');
    const [scopeEntities, scopeRelations] = await Promise.all([
      db
        .select()
        .from(entities)
        .where(
          and(
            eq(entities.workspaceId, scope.workspaceId),
            eq(entities.spaceId, scope.spaceId),
            scope.groupId ? eq(entities.groupId, scope.groupId) : isNull(entities.groupId),
          ),
        )
        .orderBy(asc(entities.createdAt)),
      db
        .select()
        .from(relations)
        .where(
          and(
            eq(relations.workspaceId, scope.workspaceId),
            eq(relations.spaceId, scope.spaceId),
            scope.groupId ? eq(relations.groupId, scope.groupId) : isNull(relations.groupId),
          ),
        )
        .orderBy(asc(relations.createdAt)),
    ]);

    this.validateLayout(payload, scopeEntities, scopeRelations);

    const now = new Date().toISOString();

    await db.transaction(async (tx) => {
      if (scope.groupId) {
        const existing = await tx.query.groupCanvasStates.findFirst({
          where: eq(groupCanvasStates.groupId, scope.groupId!),
        });

        if (existing) {
          await tx
            .update(groupCanvasStates)
            .set({
              layout: payload,
              updatedByUserId: userId,
              updatedAt: now,
            })
            .where(eq(groupCanvasStates.groupId, scope.groupId));
          return;
        }

        await tx.insert(groupCanvasStates).values({
          groupId: scope.groupId,
          layout: payload,
          createdByUserId: userId,
          updatedByUserId: userId,
          createdAt: now,
          updatedAt: now,
        });
        return;
      }

      const existing = await tx.query.spaceCanvasStates.findFirst({
        where: eq(spaceCanvasStates.spaceId, scope.spaceId),
      });

      if (existing) {
        await tx
          .update(spaceCanvasStates)
          .set({
            layout: payload,
            updatedByUserId: userId,
            updatedAt: now,
          })
          .where(eq(spaceCanvasStates.spaceId, scope.spaceId));
        return;
      }

      await tx.insert(spaceCanvasStates).values({
        spaceId: scope.spaceId,
        layout: payload,
        createdByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await this.workspaceActivityService.recordEvent({
      workspaceId: scope.workspaceId,
      spaceId: scope.spaceId,
      groupId: scope.groupId,
      actorUserId: userId,
      eventType: 'canvas.updated',
      targetType: scope.groupId ? 'group_canvas' : 'space_canvas',
      targetId: scope.groupId ?? scope.spaceId,
      summary: scope.groupId
        ? 'Canvas layout updated in group context'
        : 'Canvas layout updated in space context',
      metadata: {
        nodeCount: payload.nodes.length,
        edgeCount: payload.edges.length,
      },
    });

    return this.getCanvasStateInScope(userId, scope);
  }

  private createDefaultNode(entityId: string, index: number): CanvasNodeLayout {
    const columns = 4;
    const column = index % columns;
    const row = Math.floor(index / columns);

    return {
      entityId,
      position: {
        x: 96 + column * 280,
        y: 96 + row * 180,
      },
      size: null,
      zIndex: index + 1,
      collapsed: false,
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
