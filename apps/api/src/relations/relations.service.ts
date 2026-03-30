import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import {
  createRelationRequestSchema,
  relationIdParamsSchema,
  spaceIdParamsSchema,
  updateRelationRequestSchema,
} from '@ryba/schemas';
import type { RelationRecord } from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import { toRelationRecord } from '../db/mappers';
import { entities, relations, spaces } from '../db/schema';
import { WorkspacesService } from '../workspaces/workspaces.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type RelationIdParams = z.infer<typeof relationIdParamsSchema>;
type CreateRelationRequest = z.infer<typeof createRelationRequestSchema>;
type UpdateRelationRequest = z.infer<typeof updateRelationRequestSchema>;

@Injectable()
export class RelationsService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
  ) {}

  async createRelation(
    userId: string,
    params: SpaceIdParams,
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

    const space = await this.requireSpaceAccess(userId, params.spaceId);

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

    const endpointsBelongToSpace =
      fromEntity.workspaceId === space.workspaceId &&
      toEntity.workspaceId === space.workspaceId &&
      fromEntity.spaceId === space.id &&
      toEntity.spaceId === space.id;

    if (!endpointsBelongToSpace) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Both entities must belong to the same workspace and space',
      );
    }

    const [insertedRelation] = await db
      .insert(relations)
      .values({
        id: randomUUID(),
        workspaceId: space.workspaceId,
        spaceId: space.id,
        fromEntityId: payload.fromEntityId,
        toEntityId: payload.toEntityId,
        relationType: payload.relationType.trim(),
        properties: payload.properties ?? {},
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .returning();

    return toRelationRecord(insertedRelation);
  }

  async listRelations(
    userId: string,
    params: SpaceIdParams,
  ): Promise<RelationRecord[]> {
    const db = this.getDb();
    const space = await this.requireSpaceAccess(userId, params.spaceId);

    const rows = await db
      .select()
      .from(relations)
      .where(and(eq(relations.workspaceId, space.workspaceId), eq(relations.spaceId, space.id)))
      .orderBy(asc(relations.createdAt));

    return rows.map(toRelationRecord);
  }

  async updateRelation(
    userId: string,
    params: RelationIdParams,
    payload: UpdateRelationRequest,
  ): Promise<RelationRecord> {
    const db = this.getDb();
    const relation = await this.requireRelationAccess(userId, params.relationId);

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

    return toRelationRecord(updatedRelation);
  }

  async deleteRelation(
    userId: string,
    params: RelationIdParams,
  ): Promise<{ id: string }> {
    const db = this.getDb();
    const relation = await this.requireRelationAccess(userId, params.relationId);

    await db.delete(relations).where(eq(relations.id, relation.id));

    return {
      id: relation.id,
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

  private async requireRelationAccess(
    userId: string,
    relationId: string,
  ): Promise<typeof relations.$inferSelect> {
    const db = this.getDb();
    const relation = await db.query.relations.findFirst({
      where: eq(relations.id, relationId),
    });

    if (!relation) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Relation not found');
    }

    await this.workspacesService.requireMembership(userId, relation.workspaceId);

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
