import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import {
  createWorkspaceRequestSchema,
  inviteWorkspaceMemberRequestSchema,
  updateWorkspaceMemberRoleRequestSchema,
  workspaceIdParamsSchema,
  workspaceMemberIdParamsSchema,
} from '@ryba/schemas';
import type {
  WorkspaceMemberDetailRecord,
  WorkspaceMemberRecord,
  WorkspaceRecord,
  WorkspaceRole,
} from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import {
  toWorkspaceMemberDetailRecord,
  toWorkspaceMemberRecord,
  toWorkspaceRecord,
} from '../db/mappers';
import {
  entityTypeFields,
  entityTypes,
  users,
  workspaceMembers,
  workspaces,
} from '../db/schema';
import { DEFAULT_ENTITY_TYPE_TEMPLATES } from '../entity-types/entity-type-templates';
import { normalizeFieldConfig } from '../entity-types/entity-value';
import { WorkspaceActivityService } from './workspace-activity.service';

type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;
type WorkspaceIdParams = z.infer<typeof workspaceIdParamsSchema>;
type WorkspaceMemberIdParams = z.infer<typeof workspaceMemberIdParamsSchema>;
type InviteWorkspaceMemberRequest = z.infer<typeof inviteWorkspaceMemberRequestSchema>;
type UpdateWorkspaceMemberRoleRequest = z.infer<typeof updateWorkspaceMemberRoleRequestSchema>;
type WorkspacePermissionLevel = 'read' | 'edit' | 'manage';

const workspaceRoleRank: Record<WorkspaceRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

const requiredRankByPermission: Record<WorkspacePermissionLevel, number> = {
  read: workspaceRoleRank.viewer,
  edit: workspaceRoleRank.editor,
  manage: workspaceRoleRank.owner,
};

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(WorkspaceActivityService)
    private readonly workspaceActivityService: WorkspaceActivityService,
  ) {}

  async createWorkspace(
    userId: string,
    payload: CreateWorkspaceRequest,
  ): Promise<WorkspaceRecord> {
    const db = this.getDb();
    const slug = payload.slug.trim().toLowerCase();

    const existingWorkspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.slug, slug),
    });

    if (existingWorkspace) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'Workspace with this slug already exists',
      );
    }

    const workspaceId = randomUUID();
    const membershipId = randomUUID();
    const now = new Date().toISOString();
    const seededEntityTypes = DEFAULT_ENTITY_TYPE_TEMPLATES.map((template) => ({
      id: randomUUID(),
      workspaceId,
      name: template.name,
      slug: template.slug,
      description: template.description,
      color: template.color,
      icon: template.icon,
      isSystem: true,
      createdAt: now,
      updatedAt: now,
      fields: template.fields.map((field, index) => ({
        id: randomUUID(),
        workspaceId,
        key: field.key,
        label: field.label,
        fieldType: field.fieldType,
        description: field.description ?? null,
        required: field.required ?? false,
        order: index,
        config: normalizeFieldConfig(field.fieldType, field.config ?? {}),
        createdAt: now,
        updatedAt: now,
      })),
    }));

    const workspace = await db.transaction(async (tx) => {
      const [insertedWorkspace] = await tx
        .insert(workspaces)
        .values({
          id: workspaceId,
          ownerUserId: userId,
          name: payload.name.trim(),
          slug,
        })
        .returning();

      await tx.insert(workspaceMembers).values({
        id: membershipId,
        workspaceId,
        userId,
        role: 'owner',
      });

      await tx.insert(entityTypes).values(
        seededEntityTypes.map((entityType) => ({
          id: entityType.id,
          workspaceId: entityType.workspaceId,
          name: entityType.name,
          slug: entityType.slug,
          description: entityType.description,
          color: entityType.color,
          icon: entityType.icon,
          isSystem: entityType.isSystem,
          createdAt: entityType.createdAt,
          updatedAt: entityType.updatedAt,
        })),
      );

      await tx.insert(entityTypeFields).values(
        seededEntityTypes.flatMap((entityType) =>
          entityType.fields.map((field) => ({
            id: field.id,
            workspaceId: entityType.workspaceId,
            entityTypeId: entityType.id,
            key: field.key,
            label: field.label,
            fieldType: field.fieldType,
            description: field.description,
            required: field.required,
            order: field.order,
            config: field.config,
            createdAt: field.createdAt,
            updatedAt: field.updatedAt,
          })),
        ),
      );

      return insertedWorkspace;
    });

    return toWorkspaceRecord(workspace);
  }

  async listWorkspaces(userId: string): Promise<WorkspaceRecord[]> {
    const db = this.getDb();

    const rows = await db
      .select({
        workspace: workspaces,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(asc(workspaces.createdAt));

    return rows.map((row) => toWorkspaceRecord(row.workspace));
  }

  async listMembers(
    userId: string,
    params: WorkspaceIdParams,
  ): Promise<WorkspaceMemberDetailRecord[]> {
    const db = this.getDb();
    await this.requirePermission(userId, params.workspaceId, 'read');

    const rows = await db
      .select({
        membership: workspaceMembers,
        user: users,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, params.workspaceId))
      .orderBy(asc(workspaceMembers.createdAt));

    return rows.map((row) => toWorkspaceMemberDetailRecord(row.membership, row.user));
  }

  async inviteMember(
    userId: string,
    params: WorkspaceIdParams,
    payload: InviteWorkspaceMemberRequest,
  ): Promise<WorkspaceMemberDetailRecord> {
    const db = this.getDb();
    const email = payload.email.trim().toLowerCase();
    await this.requirePermission(userId, params.workspaceId, 'manage');

    const [workspace, targetUser] = await Promise.all([
      db.query.workspaces.findFirst({
        where: eq(workspaces.id, params.workspaceId),
      }),
      db.query.users.findFirst({
        where: eq(users.email, email),
      }),
    ]);

    if (!workspace) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Workspace not found');
    }

    if (!targetUser) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'User must register before being added to a workspace',
        {
          email,
        },
      );
    }

    const duplicateMembership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, params.workspaceId),
        eq(workspaceMembers.userId, targetUser.id),
      ),
    });

    if (duplicateMembership) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'User is already a workspace member',
      );
    }

    const [insertedMembership] = await db
      .insert(workspaceMembers)
      .values({
        id: randomUUID(),
        workspaceId: workspace.id,
        userId: targetUser.id,
        role: payload.role,
      })
      .returning();

    await this.workspaceActivityService.recordEvent({
      workspaceId: workspace.id,
      actorUserId: userId,
      eventType: 'workspace.member_added',
      targetType: 'workspace_member',
      targetId: insertedMembership.id,
      summary: `Access granted to ${targetUser.email} as ${payload.role}`,
      metadata: {
        memberUserId: targetUser.id,
        memberEmail: targetUser.email,
        role: payload.role,
      },
    });

    return toWorkspaceMemberDetailRecord(insertedMembership, targetUser);
  }

  async updateMemberRole(
    userId: string,
    params: WorkspaceMemberIdParams,
    payload: UpdateWorkspaceMemberRoleRequest,
  ): Promise<WorkspaceMemberDetailRecord> {
    const db = this.getDb();
    const targetMembership = await db.query.workspaceMembers.findFirst({
      where: eq(workspaceMembers.id, params.membershipId),
    });

    if (!targetMembership) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Workspace member not found');
    }

    await this.requirePermission(userId, targetMembership.workspaceId, 'manage');

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, targetMembership.workspaceId),
    });

    if (!workspace) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Workspace not found');
    }

    if (targetMembership.userId === workspace.ownerUserId || targetMembership.role === 'owner') {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Workspace owner role cannot be reassigned here',
      );
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, targetMembership.userId),
    });

    if (!targetUser) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'User not found');
    }

    const [updatedMembership] = await db
      .update(workspaceMembers)
      .set({
        role: payload.role,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workspaceMembers.id, targetMembership.id))
      .returning();

    await this.workspaceActivityService.recordEvent({
      workspaceId: targetMembership.workspaceId,
      actorUserId: userId,
      eventType: 'workspace.member_role_changed',
      targetType: 'workspace_member',
      targetId: updatedMembership.id,
      summary: `Role updated for ${targetUser.email}: ${payload.role}`,
      metadata: {
        memberUserId: targetUser.id,
        memberEmail: targetUser.email,
        previousRole: targetMembership.role,
        role: payload.role,
      },
    });

    return toWorkspaceMemberDetailRecord(updatedMembership, targetUser);
  }

  async requireMembership(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceMemberRecord> {
    return this.requirePermission(userId, workspaceId, 'read');
  }

  async requirePermission(
    userId: string,
    workspaceId: string,
    permission: WorkspacePermissionLevel,
  ): Promise<WorkspaceMemberRecord> {
    const db = this.getDb();

    const membership = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    });

    if (!membership) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'You do not have access to this workspace',
      );
    }

    const record = toWorkspaceMemberRecord(membership);

    if (workspaceRoleRank[record.role] < requiredRankByPermission[permission]) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        permission === 'manage'
          ? 'Only workspace owners can manage this workspace'
          : 'You do not have permission to modify this workspace',
      );
    }

    return record;
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
