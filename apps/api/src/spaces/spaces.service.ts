import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import {
  createSpaceRequestSchema,
  workspaceIdParamsSchema,
} from '@ryba/schemas';
import type { SpaceRecord } from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import { toSpaceRecord } from '../db/mappers';
import { spaces } from '../db/schema';
import { WorkspacesService } from '../workspaces/workspaces.service';

type CreateSpaceRequest = z.infer<typeof createSpaceRequestSchema>;
type WorkspaceIdParams = z.infer<typeof workspaceIdParamsSchema>;

@Injectable()
export class SpacesService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
  ) {}

  async createSpace(
    userId: string,
    params: WorkspaceIdParams,
    payload: CreateSpaceRequest,
  ): Promise<SpaceRecord> {
    const db = this.getDb();
    await this.workspacesService.requireMembership(userId, params.workspaceId);

    const slug = payload.slug.trim().toLowerCase();
    const existingSpace = await db.query.spaces.findFirst({
      where: and(
        eq(spaces.workspaceId, params.workspaceId),
        eq(spaces.slug, slug),
      ),
    });

    if (existingSpace) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'Space with this slug already exists in workspace',
      );
    }

    const [insertedSpace] = await db
      .insert(spaces)
      .values({
        id: randomUUID(),
        workspaceId: params.workspaceId,
        createdByUserId: userId,
        name: payload.name.trim(),
        slug,
      })
      .returning();

    return toSpaceRecord(insertedSpace);
  }

  async listSpaces(
    userId: string,
    params: WorkspaceIdParams,
  ): Promise<SpaceRecord[]> {
    const db = this.getDb();
    await this.workspacesService.requireMembership(userId, params.workspaceId);

    const rows = await db
      .select()
      .from(spaces)
      .where(eq(spaces.workspaceId, params.workspaceId))
      .orderBy(asc(spaces.createdAt));

    return rows.map(toSpaceRecord);
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
