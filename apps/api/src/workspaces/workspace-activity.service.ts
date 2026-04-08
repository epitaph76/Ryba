import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { ActivityEventRecord, JsonObject } from '@ryba/types';

import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import {
  toActivityActorRecord,
  toActivityEventRecord,
} from '../db/mappers';
import { activityEvents, users } from '../db/schema';

@Injectable()
export class WorkspaceActivityService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
  ) {}

  async recordEvent(input: {
    workspaceId: string;
    spaceId?: string | null;
    groupId?: string | null;
    actorUserId: string;
    eventType: string;
    targetType: string;
    targetId: string;
    summary: string;
    metadata?: JsonObject;
  }): Promise<void> {
    const db = this.getDb();

    await db.insert(activityEvents).values({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      spaceId: input.spaceId ?? null,
      groupId: input.groupId ?? null,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      metadata: input.metadata ?? {},
    });
  }

  async listWorkspaceActivity(workspaceId: string): Promise<ActivityEventRecord[]> {
    const db = this.getDb();
    const rows = await db
      .select({
        event: activityEvents,
        actor: users,
      })
      .from(activityEvents)
      .innerJoin(users, eq(activityEvents.actorUserId, users.id))
      .where(eq(activityEvents.workspaceId, workspaceId))
      .orderBy(desc(activityEvents.createdAt))
      .limit(100);

    return rows.map((row) =>
      toActivityEventRecord(row.event, toActivityActorRecord(row.actor)),
    );
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
