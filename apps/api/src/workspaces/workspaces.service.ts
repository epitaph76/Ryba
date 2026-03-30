import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { createWorkspaceRequestSchema } from '@ryba/schemas';
import type { WorkspaceMemberRecord, WorkspaceRecord } from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import { toWorkspaceMemberRecord, toWorkspaceRecord } from '../db/mappers';
import { workspaceMembers, workspaces } from '../db/schema';

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
