import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import {
  createSavedViewRequestSchema,
  savedViewIdParamsSchema,
  spaceIdParamsSchema,
  updateSavedViewRequestSchema,
} from '@ryba/schemas';
import type { SavedViewRecord } from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import { toSavedViewRecord } from '../db/mappers';
import { entityTypes, savedViews, spaces } from '../db/schema';
import { WorkspacesService } from '../workspaces/workspaces.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type SavedViewIdParams = z.infer<typeof savedViewIdParamsSchema>;
type CreateSavedViewRequest = z.infer<typeof createSavedViewRequestSchema>;
type UpdateSavedViewRequest = z.infer<typeof updateSavedViewRequestSchema>;

@Injectable()
export class ViewsService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
  ) {}

  async listSavedViews(userId: string, params: SpaceIdParams): Promise<SavedViewRecord[]> {
    const db = this.getDb();
    const space = await this.requireSpaceAccess(userId, params.spaceId);

    const rows = await db
      .select()
      .from(savedViews)
      .where(and(eq(savedViews.workspaceId, space.workspaceId), eq(savedViews.spaceId, space.id)))
      .orderBy(asc(savedViews.createdAt));

    return rows.map(toSavedViewRecord);
  }

  async createSavedView(
    userId: string,
    params: SpaceIdParams,
    payload: CreateSavedViewRequest,
  ): Promise<SavedViewRecord> {
    const db = this.getDb();
    const space = await this.requireSpaceAccess(userId, params.spaceId);

    await this.ensureEntityTypeBelongsToWorkspace(space.workspaceId, payload.entityTypeId ?? null);

    const [inserted] = await db
      .insert(savedViews)
      .values({
        id: randomUUID(),
        workspaceId: space.workspaceId,
        spaceId: space.id,
        name: payload.name.trim(),
        description: payload.description ?? null,
        entityTypeId: payload.entityTypeId ?? null,
        viewType: payload.viewType,
        config: payload.config,
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .returning();

    return toSavedViewRecord(inserted);
  }

  async updateSavedView(
    userId: string,
    params: SavedViewIdParams,
    payload: UpdateSavedViewRequest,
  ): Promise<SavedViewRecord> {
    const db = this.getDb();
    const current = await this.requireSavedViewAccess(userId, params.savedViewId);

    if (payload.entityTypeId !== undefined) {
      await this.ensureEntityTypeBelongsToWorkspace(current.workspaceId, payload.entityTypeId);
    }

    const [updated] = await db
      .update(savedViews)
      .set({
        ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
        ...(payload.description !== undefined ? { description: payload.description } : {}),
        ...(payload.entityTypeId !== undefined ? { entityTypeId: payload.entityTypeId } : {}),
        ...(payload.viewType !== undefined ? { viewType: payload.viewType } : {}),
        ...(payload.config !== undefined ? { config: payload.config } : {}),
        updatedByUserId: userId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(savedViews.id, current.id))
      .returning();

    return toSavedViewRecord(updated);
  }

  async deleteSavedView(userId: string, params: SavedViewIdParams): Promise<{ id: string }> {
    const db = this.getDb();
    const current = await this.requireSavedViewAccess(userId, params.savedViewId);

    await db.delete(savedViews).where(eq(savedViews.id, current.id));

    return {
      id: current.id,
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

  private async requireSavedViewAccess(
    userId: string,
    savedViewId: string,
  ): Promise<typeof savedViews.$inferSelect> {
    const db = this.getDb();
    const row = await db.query.savedViews.findFirst({
      where: eq(savedViews.id, savedViewId),
    });

    if (!row) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Saved view not found');
    }

    await this.workspacesService.requireMembership(userId, row.workspaceId);

    return row;
  }

  private async ensureEntityTypeBelongsToWorkspace(
    workspaceId: string,
    entityTypeId: string | null,
  ): Promise<void> {
    if (!entityTypeId) {
      return;
    }

    const db = this.getDb();
    const entityType = await db.query.entityTypes.findFirst({
      where: eq(entityTypes.id, entityTypeId),
    });

    if (!entityType || entityType.workspaceId !== workspaceId) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Saved view entity type must belong to the same workspace',
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
