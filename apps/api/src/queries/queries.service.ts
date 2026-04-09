import { randomUUID } from 'node:crypto';

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { Client } from 'pg';
import type { z } from 'zod';
import {
  createSavedQueryRequestSchema,
  dataSourceConnectionConfigSchema,
  executeSavedQueryRequestSchema,
  groupIdParamsSchema,
  publishQueryRunToDocumentRequestSchema,
  queryResultColumnRecordSchema,
  queryResultRowsSchema,
  queryRunIdParamsSchema,
  savedQueryIdParamsSchema,
  savedQueryParameterDefinitionSchema,
  savedQueryRuntimeParametersSchema,
  spaceIdParamsSchema,
  updateSavedQueryRequestSchema,
} from '@ryba/schemas';
import type {
  DocumentBlock,
  DocumentDetailRecord,
  QueryRunRecord,
  SavedQueryRecord,
} from '@ryba/types';

import { apiEnvironment } from '../app.config';
import { ApiException } from '../common/api-exception';
import { DatabaseService } from '../database.service';
import { DataSourcesService } from '../data-sources/data-sources.service';
import { DocumentsService } from '../documents/documents.service';
import { toQueryRunRecord, toSavedQueryRecord } from '../db/mappers';
import { queryRuns, savedQueries, spaces } from '../db/schema';
import { GroupsService } from '../groups/groups.service';
import { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  buildQueryResultColumns,
  buildQueryResultRows,
  coerceSavedQueryParameterValues,
  compileSavedQueryTemplate,
  mapPgTypeOidToLabel,
  SavedQueryValidationError,
  validateSavedQueryDefinition,
} from './sql-template';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type GroupIdParams = z.infer<typeof groupIdParamsSchema>;
type SavedQueryIdParams = z.infer<typeof savedQueryIdParamsSchema>;
type QueryRunIdParams = z.infer<typeof queryRunIdParamsSchema>;
type CreateSavedQueryRequest = z.infer<typeof createSavedQueryRequestSchema>;
type UpdateSavedQueryRequest = z.infer<typeof updateSavedQueryRequestSchema>;
type ExecuteSavedQueryRequest = z.infer<typeof executeSavedQueryRequestSchema>;
type PublishQueryRunToDocumentRequest = z.infer<typeof publishQueryRunToDocumentRequestSchema>;
type SavedQueryRow = typeof savedQueries.$inferSelect;
type QueryRunRow = typeof queryRuns.$inferSelect;
type SpaceRow = typeof spaces.$inferSelect;

const PUBLISHED_DOCUMENT_ROW_LIMIT = 20;

@Injectable()
export class QueriesService {
  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(DataSourcesService)
    private readonly dataSourcesService: DataSourcesService,
    @Inject(DocumentsService)
    private readonly documentsService: DocumentsService,
    @Inject(GroupsService)
    private readonly groupsService: GroupsService,
    @Inject(WorkspaceActivityService)
    private readonly workspaceActivityService: WorkspaceActivityService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
  ) {}

  async listSavedQueries(userId: string, params: SpaceIdParams): Promise<SavedQueryRecord[]> {
    const space = await this.requireSpaceAccess(userId, params.spaceId, 'read');

    return this.listSavedQueriesInScope(userId, {
      workspaceId: space.workspaceId,
      spaceId: space.id,
      groupId: null,
    });
  }

  async listGroupSavedQueries(userId: string, params: GroupIdParams): Promise<SavedQueryRecord[]> {
    const group = await this.groupsService.requireGroupAccess(userId, params.groupId, 'read');

    return this.listSavedQueriesInScope(userId, {
      workspaceId: group.workspaceId,
      spaceId: group.spaceId,
      groupId: group.id,
    });
  }

  async createSavedQuery(
    userId: string,
    params: SpaceIdParams,
    payload: CreateSavedQueryRequest,
  ): Promise<SavedQueryRecord> {
    const space = await this.requireSpaceAccess(userId, params.spaceId, 'edit');

    return this.createSavedQueryInScope(
      userId,
      {
        workspaceId: space.workspaceId,
        spaceId: space.id,
        groupId: null,
      },
      payload,
    );
  }

  async createGroupSavedQuery(
    userId: string,
    params: GroupIdParams,
    payload: CreateSavedQueryRequest,
  ): Promise<SavedQueryRecord> {
    const group = await this.groupsService.requireGroupAccess(userId, params.groupId, 'edit');

    return this.createSavedQueryInScope(
      userId,
      {
        workspaceId: group.workspaceId,
        spaceId: group.spaceId,
        groupId: group.id,
      },
      payload,
    );
  }

  async updateSavedQuery(
    userId: string,
    params: SavedQueryIdParams,
    payload: UpdateSavedQueryRequest,
  ): Promise<SavedQueryRecord> {
    const db = this.getDb();
    const current = await this.requireSavedQueryAccess(userId, params.savedQueryId, 'edit');
    const parameterDefinitions =
      payload.parameterDefinitions !== undefined
        ? payload.parameterDefinitions
        : savedQueryParameterDefinitionSchema.array().parse(current.parameterDefinitions);
    const sqlTemplate = payload.sqlTemplate ?? current.sqlTemplate;
    const dataSourceId = payload.dataSourceId ?? current.dataSourceId;

    this.ensureSavedQueryDefinitionValid(sqlTemplate, parameterDefinitions);
    await this.dataSourcesService.requireDataSourceForWorkspace(current.workspaceId, dataSourceId);

    const [updated] = await db
      .update(savedQueries)
      .set({
        ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
        ...(payload.description !== undefined
          ? { description: payload.description?.trim() || null }
          : {}),
        ...(payload.dataSourceId !== undefined ? { dataSourceId } : {}),
        ...(payload.sqlTemplate !== undefined ? { sqlTemplate: sqlTemplate.trim() } : {}),
        ...(payload.parameterDefinitions !== undefined
          ? { parameterDefinitions }
          : {}),
        updatedByUserId: userId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(savedQueries.id, current.id))
      .returning();

    await this.workspaceActivityService.recordEvent({
      workspaceId: updated.workspaceId,
      spaceId: updated.spaceId,
      groupId: updated.groupId,
      actorUserId: userId,
      eventType: 'saved_query.updated',
      targetType: 'saved_query',
      targetId: updated.id,
      summary: `Saved query updated: ${updated.name}`,
      metadata: {
        dataSourceId: updated.dataSourceId,
        parameterCount: parameterDefinitions.length,
      },
    });

    return toSavedQueryRecord(updated);
  }

  async deleteSavedQuery(userId: string, params: SavedQueryIdParams): Promise<{ id: string }> {
    const current = await this.requireSavedQueryAccess(userId, params.savedQueryId, 'edit');

    await this.getDb().delete(savedQueries).where(eq(savedQueries.id, current.id));

    await this.workspaceActivityService.recordEvent({
      workspaceId: current.workspaceId,
      spaceId: current.spaceId,
      groupId: current.groupId,
      actorUserId: userId,
      eventType: 'saved_query.deleted',
      targetType: 'saved_query',
      targetId: current.id,
      summary: `Saved query deleted: ${current.name}`,
      metadata: {
        dataSourceId: current.dataSourceId,
      },
    });

    return {
      id: current.id,
    };
  }

  async executeSavedQuery(
    userId: string,
    params: SavedQueryIdParams,
    payload: ExecuteSavedQueryRequest,
  ): Promise<QueryRunRecord> {
    const savedQuery = await this.requireSavedQueryAccess(userId, params.savedQueryId, 'read');
    const dataSource = await this.dataSourcesService.requireDataSourceForWorkspace(
      savedQuery.workspaceId,
      savedQuery.dataSourceId,
    );
    const parameterDefinitions = savedQueryParameterDefinitionSchema
      .array()
      .parse(savedQuery.parameterDefinitions);
    const startedAt = new Date();
    let status: QueryRunRecord['status'] = 'failed';
    let errorMessage: string | null = null;
    let rowCount = 0;
    let truncated = false;
    let columns: QueryRunRecord['columns'] = [];
    let rows: QueryRunRecord['rows'] = [];
    let durationMs: number | null = null;
    let finishedAt: string | null = null;
    let normalizedParameters: z.infer<typeof savedQueryRuntimeParametersSchema> = {};
    let thrownError: unknown = null;

    try {
      validateSavedQueryDefinition(savedQuery.sqlTemplate, parameterDefinitions);
      normalizedParameters = savedQueryRuntimeParametersSchema.parse(
        coerceSavedQueryParameterValues(parameterDefinitions, payload.parameters ?? {}),
      );

      const compiled = compileSavedQueryTemplate(savedQuery.sqlTemplate, normalizedParameters);
      const result = await this.runExternalQuery(
        dataSourceConnectionConfigSchema.parse(dataSource.connectionConfig),
        compiled.text,
        compiled.values,
      );

      status = 'succeeded';
      rowCount = result.rows.length;
      truncated = result.truncated;
      columns = queryResultColumnRecordSchema.array().parse(result.columns);
      rows = queryResultRowsSchema.parse(result.rows) as QueryRunRecord['rows'];
    } catch (error) {
      thrownError = error;
      errorMessage = this.toRunErrorMessage(error);
    } finally {
      durationMs = Math.max(0, Date.now() - startedAt.getTime());
      finishedAt = new Date().toISOString();
    }

    const [storedRun] = await this.getDb()
      .insert(queryRuns)
      .values({
        id: randomUUID(),
        workspaceId: savedQuery.workspaceId,
        spaceId: savedQuery.spaceId,
        groupId: savedQuery.groupId,
        dataSourceId: savedQuery.dataSourceId,
        savedQueryId: savedQuery.id,
        actorUserId: userId,
        status,
        parameters: normalizedParameters,
        rowCount,
        truncated,
        columns,
        rows,
        errorMessage,
        durationMs,
        startedAt: startedAt.toISOString(),
        finishedAt,
      })
      .returning();

    await this.workspaceActivityService.recordEvent({
      workspaceId: savedQuery.workspaceId,
      spaceId: savedQuery.spaceId,
      groupId: savedQuery.groupId,
      actorUserId: userId,
      eventType: status === 'succeeded' ? 'saved_query.executed' : 'saved_query.failed',
      targetType: 'saved_query',
      targetId: savedQuery.id,
      summary:
        status === 'succeeded'
          ? `Saved query executed: ${savedQuery.name}`
          : `Saved query failed: ${savedQuery.name}`,
      metadata: {
        runId: storedRun.id,
        rowCount,
        truncated,
      },
    });

    if (thrownError) {
      throw this.toExecutionException(thrownError);
    }

    return toQueryRunRecord(storedRun);
  }

  async listQueryRuns(userId: string, params: SavedQueryIdParams): Promise<QueryRunRecord[]> {
    const savedQuery = await this.requireSavedQueryAccess(userId, params.savedQueryId, 'read');
    const rows = await this.getDb()
      .select()
      .from(queryRuns)
      .where(eq(queryRuns.savedQueryId, savedQuery.id))
      .orderBy(desc(queryRuns.startedAt), asc(queryRuns.id))
      .limit(10);

    return rows.map(toQueryRunRecord);
  }

  async publishQueryRunToDocument(
    userId: string,
    params: QueryRunIdParams,
    payload: PublishQueryRunToDocumentRequest,
  ): Promise<DocumentDetailRecord> {
    const run = await this.requireQueryRunAccess(userId, params.queryRunId, 'edit');

    if (run.status !== 'succeeded') {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Only successful query runs can be published to a document',
      );
    }

    const savedQuery = await this.getDb().query.savedQueries.findFirst({
      where: eq(savedQueries.id, run.savedQueryId),
    });

    if (!savedQuery) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Saved query not found');
    }

    const dataSource = await this.dataSourcesService.requireDataSourceForWorkspace(
      run.workspaceId,
      run.dataSourceId,
    );
    const columns = queryResultColumnRecordSchema.array().parse(run.columns);
    const rows = queryResultRowsSchema.parse(run.rows) as QueryRunRecord['rows'];
    const documentTitle = payload.title?.trim() || `${savedQuery.name} dataset`;
    const body = this.buildPublishedDocumentBody({
      documentTitle,
      savedQuery: toSavedQueryRecord(savedQuery),
      dataSourceName: dataSource.name,
      run: toQueryRunRecord(run),
      columns,
      rows,
    });

    const detail = run.groupId
      ? await this.documentsService.createGroupDocument(
          userId,
          { groupId: run.groupId },
          { title: documentTitle, body },
        )
      : await this.documentsService.createDocument(
          userId,
          { spaceId: run.spaceId },
          { title: documentTitle, body },
        );

    await this.workspaceActivityService.recordEvent({
      workspaceId: run.workspaceId,
      spaceId: run.spaceId,
      groupId: run.groupId,
      actorUserId: userId,
      eventType: 'saved_query.published',
      targetType: 'document',
      targetId: detail.document.id,
      summary: `Query output published: ${savedQuery.name}`,
      metadata: {
        runId: run.id,
        savedQueryId: savedQuery.id,
        documentId: detail.document.id,
      },
    });

    return detail;
  }

  private async listSavedQueriesInScope(
    userId: string,
    scope: { workspaceId: string; spaceId: string; groupId: string | null },
  ) {
    await this.workspacesService.requirePermission(userId, scope.workspaceId, 'read');

    const rows = await this.getDb()
      .select()
      .from(savedQueries)
      .where(
        and(
          eq(savedQueries.workspaceId, scope.workspaceId),
          eq(savedQueries.spaceId, scope.spaceId),
          scope.groupId ? eq(savedQueries.groupId, scope.groupId) : isNull(savedQueries.groupId),
        ),
      )
      .orderBy(asc(savedQueries.createdAt));

    return rows.map(toSavedQueryRecord);
  }

  private async createSavedQueryInScope(
    userId: string,
    scope: { workspaceId: string; spaceId: string; groupId: string | null },
    payload: CreateSavedQueryRequest,
  ) {
    this.ensureSavedQueryDefinitionValid(payload.sqlTemplate, payload.parameterDefinitions);
    await this.dataSourcesService.requireDataSourceForWorkspace(
      scope.workspaceId,
      payload.dataSourceId,
    );

    const [inserted] = await this.getDb()
      .insert(savedQueries)
      .values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        spaceId: scope.spaceId,
        groupId: scope.groupId,
        dataSourceId: payload.dataSourceId,
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
        sqlTemplate: payload.sqlTemplate.trim(),
        parameterDefinitions: payload.parameterDefinitions,
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .returning();

    await this.workspaceActivityService.recordEvent({
      workspaceId: inserted.workspaceId,
      spaceId: inserted.spaceId,
      groupId: inserted.groupId,
      actorUserId: userId,
      eventType: 'saved_query.created',
      targetType: 'saved_query',
      targetId: inserted.id,
      summary: `Saved query created: ${inserted.name}`,
      metadata: {
        dataSourceId: inserted.dataSourceId,
        parameterCount: payload.parameterDefinitions.length,
      },
    });

    return toSavedQueryRecord(inserted);
  }

  private async runExternalQuery(
    connectionConfig: z.infer<typeof dataSourceConnectionConfigSchema>,
    sqlText: string,
    values: Array<string | number | boolean | null>,
  ) {
    const rowLimit = apiEnvironment.EXTERNAL_QUERY_MAX_ROWS;
    const client = new Client({
      connectionString: connectionConfig.connectionString,
      connectionTimeoutMillis: Math.min(apiEnvironment.EXTERNAL_QUERY_TIMEOUT_MS, 5000),
    });
    let transactionOpened = false;

    try {
      await client.connect();
      await client.query('BEGIN READ ONLY');
      transactionOpened = true;
      await client.query(`SET LOCAL statement_timeout = ${apiEnvironment.EXTERNAL_QUERY_TIMEOUT_MS}`);
      await client.query(
        `SET LOCAL idle_in_transaction_session_timeout = ${apiEnvironment.EXTERNAL_QUERY_TIMEOUT_MS}`,
      );
      await client.query(
        `SET LOCAL lock_timeout = ${Math.min(apiEnvironment.EXTERNAL_QUERY_TIMEOUT_MS, 5000)}`,
      );

      const result = await client.query({
        text: `select * from (${sqlText}) as ryba_dataset limit ${rowLimit + 1}`,
        values,
        rowMode: 'array',
      });
      const truncated = result.rows.length > rowLimit;
      const labels = result.fields.map((field) => ({
        label: field.name,
        dataType: mapPgTypeOidToLabel(field.dataTypeID),
      }));
      const columns = buildQueryResultColumns(labels);
      const rows = buildQueryResultRows(columns, result.rows.slice(0, rowLimit) as unknown[][]);

      return {
        truncated,
        columns,
        rows,
      };
    } finally {
      if (transactionOpened) {
        await client.query('ROLLBACK').catch(() => undefined);
      }

      await client.end().catch(() => undefined);
    }
  }

  private buildPublishedDocumentBody(input: {
    documentTitle: string;
    savedQuery: SavedQueryRecord;
    dataSourceName: string;
    run: QueryRunRecord;
    columns: QueryRunRecord['columns'];
    rows: QueryRunRecord['rows'];
  }): DocumentBlock[] {
    const blocks: DocumentBlock[] = [
      {
        id: 'query-output-heading',
        kind: 'heading',
        text: input.documentTitle,
        entityReferences: [],
      },
      {
        id: 'query-output-meta',
        kind: 'paragraph',
        text: [
          `Source: ${input.dataSourceName}`,
          `Query: ${input.savedQuery.name}`,
          `Executed: ${input.run.startedAt}`,
          `Rows: ${input.run.rowCount}${input.run.truncated ? ` (showing first ${input.run.rowCount})` : ''}`,
        ].join(' | '),
        entityReferences: [],
      },
    ];

    if (Object.keys(input.run.parameters).length > 0) {
      blocks.push({
        id: 'query-output-params',
        kind: 'paragraph',
        text: `Parameters: ${JSON.stringify(input.run.parameters)}`,
        entityReferences: [],
      });
    }

    if (input.rows.length === 0) {
      blocks.push({
        id: 'query-output-empty',
        kind: 'paragraph',
        text: 'Query returned no rows.',
        entityReferences: [],
      });

      return blocks;
    }

    blocks.push({
      id: 'query-output-preview',
      kind: 'paragraph',
      text: 'Preview rows:',
      entityReferences: [],
    });

    blocks.push(
      ...input.rows.slice(0, PUBLISHED_DOCUMENT_ROW_LIMIT).map((row, index) => ({
        id: `query-output-row-${index + 1}`,
        kind: 'list_item' as const,
        text: input.columns
          .map((column) => `${column.label}: ${formatDocumentCellValue(row[column.key])}`)
          .join(' | '),
        entityReferences: [],
      })),
    );

    if (input.rows.length > PUBLISHED_DOCUMENT_ROW_LIMIT || input.run.truncated) {
      blocks.push({
        id: 'query-output-truncated',
        kind: 'paragraph',
        text: 'Document keeps a compact snapshot. Use the saved query to rerun the live dataset.',
        entityReferences: [],
      });
    }

    return blocks;
  }

  private async requireSavedQueryAccess(
    userId: string,
    savedQueryId: string,
    permission: 'read' | 'edit' | 'manage' = 'read',
  ): Promise<SavedQueryRow> {
    const row = await this.getDb().query.savedQueries.findFirst({
      where: eq(savedQueries.id, savedQueryId),
    });

    if (!row) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Saved query not found');
    }

    await this.workspacesService.requirePermission(userId, row.workspaceId, permission);

    return row;
  }

  private async requireQueryRunAccess(
    userId: string,
    queryRunId: string,
    permission: 'read' | 'edit' | 'manage' = 'read',
  ): Promise<QueryRunRow> {
    const row = await this.getDb().query.queryRuns.findFirst({
      where: eq(queryRuns.id, queryRunId),
    });

    if (!row) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Query run not found');
    }

    await this.workspacesService.requirePermission(userId, row.workspaceId, permission);

    return row;
  }

  private async requireSpaceAccess(
    userId: string,
    spaceId: string,
    permission: 'read' | 'edit' | 'manage' = 'read',
  ): Promise<SpaceRow> {
    const space = await this.getDb().query.spaces.findFirst({
      where: eq(spaces.id, spaceId),
    });

    if (!space) {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Space not found');
    }

    await this.workspacesService.requirePermission(userId, space.workspaceId, permission);

    return space;
  }

  private ensureSavedQueryDefinitionValid(
    sqlTemplate: string,
    parameterDefinitions: z.infer<typeof savedQueryParameterDefinitionSchema>[],
  ) {
    try {
      validateSavedQueryDefinition(sqlTemplate, parameterDefinitions);
    } catch (error) {
      if (error instanceof SavedQueryValidationError) {
        throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', error.message);
      }

      throw error;
    }
  }

  private toRunErrorMessage(error: unknown) {
    if (error instanceof SavedQueryValidationError) {
      return error.message;
    }

    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      return error.message;
    }

    return 'External query execution failed';
  }

  private toExecutionException(error: unknown) {
    if (error instanceof ApiException) {
      return error;
    }

    if (error instanceof SavedQueryValidationError) {
      return new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', error.message);
    }

    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof error.code === 'string' &&
      error.code === '57014'
    ) {
      return new ApiException(
        HttpStatus.REQUEST_TIMEOUT,
        'QUERY_TIMEOUT',
        'External query timed out before finishing',
      );
    }

    return new ApiException(
      HttpStatus.BAD_GATEWAY,
      'EXTERNAL_SOURCE_ERROR',
      this.toRunErrorMessage(error),
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

const formatDocumentCellValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return 'empty';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
};
