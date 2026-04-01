import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { saveCanvasStateRequestSchema, spaceIdParamsSchema } from '@ryba/schemas';
import type { CanvasNodeLayout, CanvasStateRecord } from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import { toCanvasStateRecord } from '../db/mappers';
import { entities, relations, spaceCanvasStates, spaces } from '../db/schema';
import { WorkspacesService } from '../workspaces/workspaces.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type SaveCanvasStateRequest = z.infer<typeof saveCanvasStateRequestSchema>;
type EntityRow = typeof entities.$inferSelect;
type RelationRow = typeof relations.$inferSelect;

@Injectable()
export class CanvasService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
  ) {}

  async getCanvasState(
    userId: string,
    params: SpaceIdParams,
  ): Promise<CanvasStateRecord> {
    const db = this.getDb();
    const space = await this.requireSpaceAccess(userId, params.spaceId);
    const [spaceEntities, spaceRelations, state] = await Promise.all([
      db
        .select()
        .from(entities)
        .where(and(eq(entities.workspaceId, space.workspaceId), eq(entities.spaceId, space.id)))
        .orderBy(asc(entities.createdAt)),
      db
        .select()
        .from(relations)
        .where(and(eq(relations.workspaceId, space.workspaceId), eq(relations.spaceId, space.id)))
        .orderBy(asc(relations.createdAt)),
      db.query.spaceCanvasStates.findFirst({
        where: eq(spaceCanvasStates.spaceId, space.id),
      }),
    ]);

    return this.resolveCanvasState(
      space.id,
      spaceEntities,
      spaceRelations,
      state ? toCanvasStateRecord(state) : null,
    );
  }

  async saveCanvasState(
    userId: string,
    params: SpaceIdParams,
    payload: SaveCanvasStateRequest,
  ): Promise<CanvasStateRecord> {
    const db = this.getDb();
    const space = await this.requireSpaceAccess(userId, params.spaceId);
    const [spaceEntities, spaceRelations] = await Promise.all([
      db
        .select()
        .from(entities)
        .where(and(eq(entities.workspaceId, space.workspaceId), eq(entities.spaceId, space.id)))
        .orderBy(asc(entities.createdAt)),
      db
        .select()
        .from(relations)
        .where(and(eq(relations.workspaceId, space.workspaceId), eq(relations.spaceId, space.id)))
        .orderBy(asc(relations.createdAt)),
    ]);

    this.validateLayout(payload, spaceEntities, spaceRelations);

    const now = new Date().toISOString();

    await db.transaction(async (tx) => {
      const existing = await tx.query.spaceCanvasStates.findFirst({
        where: eq(spaceCanvasStates.spaceId, space.id),
      });

      if (existing) {
        await tx
          .update(spaceCanvasStates)
          .set({
            layout: payload,
            updatedByUserId: userId,
            updatedAt: now,
          })
          .where(eq(spaceCanvasStates.spaceId, space.id));
        return;
      }

      await tx.insert(spaceCanvasStates).values({
        spaceId: space.id,
        layout: payload,
        createdByUserId: userId,
        updatedByUserId: userId,
        createdAt: now,
        updatedAt: now,
      });
    });

    const state = await db.query.spaceCanvasStates.findFirst({
      where: eq(spaceCanvasStates.spaceId, space.id),
    });

    return this.resolveCanvasState(
      space.id,
      spaceEntities,
      spaceRelations,
      state ? toCanvasStateRecord(state) : null,
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
