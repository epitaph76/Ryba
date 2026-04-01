import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { createWorkspaceRequestSchema } from '@ryba/schemas';
import type { WorkspaceMemberRecord, WorkspaceRecord } from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import { toWorkspaceMemberRecord, toWorkspaceRecord } from '../db/mappers';
import { entityTypeFields, entityTypes, workspaceMembers, workspaces } from '../db/schema';
import { DEFAULT_ENTITY_TYPE_TEMPLATES } from '../entity-types/entity-type-templates';
import { normalizeFieldConfig } from '../entity-types/entity-value';

type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
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

  async requireMembership(
    userId: string,
    workspaceId: string,
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

    return toWorkspaceMemberRecord(membership);
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
