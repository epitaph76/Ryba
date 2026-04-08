import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import {
  createGroupRequestSchema,
  groupIdParamsSchema,
  spaceIdParamsSchema,
} from '@ryba/schemas';
import type { GroupRecord } from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import { toGroupRecord } from '../db/mappers';
import { groups, spaces } from '../db/schema';
import { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type GroupIdParams = z.infer<typeof groupIdParamsSchema>;
type CreateGroupRequest = z.infer<typeof createGroupRequestSchema>;

@Injectable()
export class GroupsService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(WorkspaceActivityService)
    private readonly workspaceActivityService: WorkspaceActivityService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
  ) {}

  async createGroup(
    userId: string,
    params: SpaceIdParams,
    payload: CreateGroupRequest,
  ): Promise<GroupRecord> {
    const db = this.getDb();
    const space = await this.requireSpaceAccess(userId, params.spaceId, 'manage');
    const slug = payload.slug.trim().toLowerCase();
    const existingGroup = await db.query.groups.findFirst({
      where: and(eq(groups.spaceId, space.id), eq(groups.slug, slug)),
    });

    if (existingGroup) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'Group with this slug already exists in space',
      );
    }

    const [insertedGroup] = await db
      .insert(groups)
      .values({
        id: randomUUID(),
        workspaceId: space.workspaceId,
        spaceId: space.id,
        createdByUserId: userId,
        name: payload.name.trim(),
        slug,
        description: payload.description ?? null,
      })
      .returning();

    await this.workspaceActivityService.recordEvent({
      workspaceId: insertedGroup.workspaceId,
      spaceId: insertedGroup.spaceId,
      groupId: insertedGroup.id,
      actorUserId: userId,
      eventType: 'group.created',
      targetType: 'group',
      targetId: insertedGroup.id,
      summary: `Group created: ${insertedGroup.name}`,
      metadata: {
        slug: insertedGroup.slug,
      },
    });

    return toGroupRecord(insertedGroup);
  }

  async listGroups(userId: string, params: SpaceIdParams): Promise<GroupRecord[]> {
    const db = this.getDb();
    const space = await this.requireSpaceAccess(userId, params.spaceId, 'read');

    const rows = await db
      .select()
      .from(groups)
      .where(and(eq(groups.workspaceId, space.workspaceId), eq(groups.spaceId, space.id)))
      .orderBy(asc(groups.createdAt));

    return rows.map(toGroupRecord);
  }

  async requireGroupAccess(
    userId: string,
    groupId: string | GroupIdParams,
    permission: 'read' | 'edit' | 'manage' = 'read',
  ): Promise<typeof groups.$inferSelect> {
    const db = this.getDb();
    const resolvedGroupId = typeof groupId === 'string' ? groupId : groupId.groupId;
    const group = await db.query.groups.findFirst({
      where: eq(groups.id, resolvedGroupId),
    });

    if (!group) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Group not found');
    }

    await this.workspacesService.requirePermission(userId, group.workspaceId, permission);

    return group;
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
