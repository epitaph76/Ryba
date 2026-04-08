import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { z } from 'zod';
import {
  createSavedViewRequestSchema,
  groupIdParamsSchema,
  savedViewIdParamsSchema,
  spaceIdParamsSchema,
  updateSavedViewRequestSchema,
} from '@ryba/schemas';
import type { SavedViewRecord } from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import { toSavedViewRecord } from '../db/mappers';
import { entityTypes, savedViews, spaces } from '../db/schema';
import { GroupsService } from '../groups/groups.service';
import { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type GroupIdParams = z.infer<typeof groupIdParamsSchema>;
type SavedViewIdParams = z.infer<typeof savedViewIdParamsSchema>;
type CreateSavedViewRequest = z.infer<typeof createSavedViewRequestSchema>;
type UpdateSavedViewRequest = z.infer<typeof updateSavedViewRequestSchema>;

@Injectable()
export class ViewsService {
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

  async listSavedViews(userId: string, params: SpaceIdParams): Promise<SavedViewRecord[]> {
    const space = await this.requireSpaceAccess(userId, params.spaceId, 'read');

    return this.listSavedViewsInScope(userId, {
      workspaceId: space.workspaceId,
      spaceId: space.id,
      groupId: null,
    });
  }

  async listGroupSavedViews(userId: string, params: GroupIdParams): Promise<SavedViewRecord[]> {
    const group = await this.groupsService.requireGroupAccess(userId, params.groupId, 'read');

    return this.listSavedViewsInScope(userId, {
      workspaceId: group.workspaceId,
      spaceId: group.spaceId,
      groupId: group.id,
    });
  }

  async createSavedView(
    userId: string,
    params: SpaceIdParams,
    payload: CreateSavedViewRequest,
  ): Promise<SavedViewRecord> {
    const space = await this.requireSpaceAccess(userId, params.spaceId, 'edit');

    return this.createSavedViewInScope(
      userId,
      {
        workspaceId: space.workspaceId,
        spaceId: space.id,
        groupId: null,
      },
      payload,
    );
  }

  async createGroupSavedView(
    userId: string,
    params: GroupIdParams,
    payload: CreateSavedViewRequest,
  ): Promise<SavedViewRecord> {
    const group = await this.groupsService.requireGroupAccess(userId, params.groupId, 'edit');

    return this.createSavedViewInScope(
      userId,
      {
        workspaceId: group.workspaceId,
        spaceId: group.spaceId,
        groupId: group.id,
      },
      payload,
    );
  }

  async updateSavedView(
    userId: string,
    params: SavedViewIdParams,
    payload: UpdateSavedViewRequest,
  ): Promise<SavedViewRecord> {
    const db = this.getDb();
    const current = await this.requireSavedViewAccess(userId, params.savedViewId, 'edit');

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

    await this.workspaceActivityService.recordEvent({
      workspaceId: updated.workspaceId,
      spaceId: updated.spaceId,
      groupId: updated.groupId,
      actorUserId: userId,
      eventType: 'saved_view.updated',
      targetType: 'saved_view',
      targetId: updated.id,
      summary: `Saved view updated: ${updated.name}`,
      metadata: {
        viewType: updated.viewType,
      },
    });

    return toSavedViewRecord(updated);
  }

  async deleteSavedView(userId: string, params: SavedViewIdParams): Promise<{ id: string }> {
    const db = this.getDb();
    const current = await this.requireSavedViewAccess(userId, params.savedViewId, 'edit');

    await db.delete(savedViews).where(eq(savedViews.id, current.id));

    await this.workspaceActivityService.recordEvent({
      workspaceId: current.workspaceId,
      spaceId: current.spaceId,
      groupId: current.groupId,
      actorUserId: userId,
      eventType: 'saved_view.deleted',
      targetType: 'saved_view',
      targetId: current.id,
      summary: `Saved view deleted: ${current.name}`,
      metadata: {
        viewType: current.viewType,
      },
    });

    return {
      id: current.id,
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

  private async listSavedViewsInScope(
    userId: string,
    scope: {
      workspaceId: string;
      spaceId: string;
      groupId: string | null;
    },
  ): Promise<SavedViewRecord[]> {
    const db = this.getDb();
    await this.workspacesService.requirePermission(userId, scope.workspaceId, 'read');

    const rows = await db
      .select()
      .from(savedViews)
      .where(
        and(
          eq(savedViews.workspaceId, scope.workspaceId),
          eq(savedViews.spaceId, scope.spaceId),
          scope.groupId ? eq(savedViews.groupId, scope.groupId) : isNull(savedViews.groupId),
        ),
      )
      .orderBy(asc(savedViews.createdAt));

    return rows.map(toSavedViewRecord);
  }

  private async createSavedViewInScope(
    userId: string,
    scope: {
      workspaceId: string;
      spaceId: string;
      groupId: string | null;
    },
    payload: CreateSavedViewRequest,
  ): Promise<SavedViewRecord> {
    const db = this.getDb();
    await this.ensureEntityTypeBelongsToWorkspace(scope.workspaceId, payload.entityTypeId ?? null);

    const [inserted] = await db
      .insert(savedViews)
      .values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        spaceId: scope.spaceId,
        groupId: scope.groupId,
        name: payload.name.trim(),
        description: payload.description ?? null,
        entityTypeId: payload.entityTypeId ?? null,
        viewType: payload.viewType,
        config: payload.config,
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .returning();

    await this.workspaceActivityService.recordEvent({
      workspaceId: inserted.workspaceId,
      spaceId: inserted.spaceId,
      groupId: inserted.groupId,
      actorUserId: userId,
      eventType: 'saved_view.created',
      targetType: 'saved_view',
      targetId: inserted.id,
      summary: `Saved view created: ${inserted.name}`,
      metadata: {
        viewType: inserted.viewType,
      },
    });

    return toSavedViewRecord(inserted);
  }

  private async requireSavedViewAccess(
    userId: string,
    savedViewId: string,
    permission: 'read' | 'edit' | 'manage' = 'read',
  ): Promise<typeof savedViews.$inferSelect> {
    const db = this.getDb();
    const row = await db.query.savedViews.findFirst({
      where: eq(savedViews.id, savedViewId),
    });

    if (!row) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Saved view not found');
    }

    await this.workspacesService.requirePermission(userId, row.workspaceId, permission);

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
