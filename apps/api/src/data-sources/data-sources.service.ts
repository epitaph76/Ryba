import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { Client } from 'pg';
import type { z } from 'zod';
import {
  createDataSourceRequestSchema,
  dataSourceConnectionConfigSchema,
  workspaceIdParamsSchema,
} from '@ryba/schemas';
import type { DataSourceRecord } from '@ryba/types';

import { apiEnvironment } from '../app.config';
import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import { toDataSourceRecord } from '../db/mappers';
import { dataSources } from '../db/schema';
import { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

type WorkspaceIdParams = z.infer<typeof workspaceIdParamsSchema>;
type CreateDataSourceRequest = z.infer<typeof createDataSourceRequestSchema>;
type DataSourceRow = typeof dataSources.$inferSelect;

@Injectable()
export class DataSourcesService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(WorkspaceActivityService)
    private readonly workspaceActivityService: WorkspaceActivityService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
  ) {}

  async listDataSources(userId: string, params: WorkspaceIdParams): Promise<DataSourceRecord[]> {
    await this.workspacesService.requirePermission(userId, params.workspaceId, 'read');

    const rows = await this.getDb()
      .select()
      .from(dataSources)
      .where(eq(dataSources.workspaceId, params.workspaceId))
      .orderBy(asc(dataSources.createdAt));

    return rows.map(toDataSourceRecord);
  }

  async createDataSource(
    userId: string,
    params: WorkspaceIdParams,
    payload: CreateDataSourceRequest,
  ): Promise<DataSourceRecord> {
    const db = this.getDb();
    await this.workspacesService.requirePermission(userId, params.workspaceId, 'manage');

    const name = payload.name.trim();
    const existingRows = await db
      .select()
      .from(dataSources)
      .where(eq(dataSources.workspaceId, params.workspaceId));

    if (existingRows.some((row) => row.name.trim().toLowerCase() === name.toLowerCase())) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'Data source with this name already exists in the workspace',
      );
    }

    const connectionConfig = this.parseConnectionConfig(payload.connectionString);
    await this.verifyConnection(connectionConfig.connectionString);

    const [inserted] = await db
      .insert(dataSources)
      .values({
        id: randomUUID(),
        workspaceId: params.workspaceId,
        kind: 'postgres',
        name,
        description: payload.description?.trim() || null,
        connectionConfig,
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .returning();

    await this.workspaceActivityService.recordEvent({
      workspaceId: inserted.workspaceId,
      actorUserId: userId,
      eventType: 'data_source.created',
      targetType: 'data_source',
      targetId: inserted.id,
      summary: `Data source connected: ${inserted.name}`,
      metadata: {
        kind: inserted.kind,
      },
    });

    return toDataSourceRecord(inserted);
  }

  async requireDataSourceForWorkspace(
    workspaceId: string,
    dataSourceId: string,
  ): Promise<DataSourceRow> {
    const row = await this.getDb().query.dataSources.findFirst({
      where: eq(dataSources.id, dataSourceId),
    });

    if (!row || row.workspaceId !== workspaceId) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Data source not found in this workspace',
      );
    }

    return row;
  }

  private parseConnectionConfig(connectionString: string) {
    const trimmed = connectionString.trim();
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(trimmed);
    } catch {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Data source connection string must be a valid PostgreSQL URL',
      );
    }

    if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Only PostgreSQL data sources are supported in this stage',
      );
    }

    const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
    const username = decodeURIComponent(parsedUrl.username);
    const port = parsedUrl.port ? Number(parsedUrl.port) : null;

    if (!parsedUrl.hostname || !databaseName || !username) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Connection string must include host, database and user credentials',
      );
    }

    return dataSourceConnectionConfigSchema.parse({
      connectionString: trimmed,
      host: parsedUrl.hostname,
      port: Number.isFinite(port) ? port : null,
      databaseName,
      username,
      sslMode: parsedUrl.searchParams.get('sslmode')?.trim() || null,
    });
  }

  private async verifyConnection(connectionString: string) {
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: Math.min(apiEnvironment.EXTERNAL_QUERY_TIMEOUT_MS, 5000),
    });

    try {
      await client.connect();
      await client.query('select current_database() as database_name, current_user as username');
    } catch (error) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        error instanceof Error
          ? `Failed to connect to external PostgreSQL data source: ${error.message}`
          : 'Failed to connect to external PostgreSQL data source',
      );
    } finally {
      await client.end().catch(() => undefined);
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
