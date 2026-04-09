import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { Pool } from 'pg';
import {
  authSessionSchema,
  dataSourceRecordSchema,
  documentDetailRecordSchema,
  listActivityEventsResponseSchema,
  listDataSourcesResponseSchema,
  listQueryRunsResponseSchema,
  listSavedQueriesResponseSchema,
  queryRunRecordSchema,
  savedQueryRecordSchema,
  spaceRecordSchema,
  workspaceRecordSchema,
} from '@ryba/schemas';
import type {
  ActivityEventRecord,
  ApiEnvelope,
  AuthSession,
  DataSourceRecord,
  DocumentDetailRecord,
  QueryRunRecord,
  SavedQueryRecord,
  SpaceRecord,
  WorkspaceMemberDetailRecord,
  WorkspaceRecord,
} from '@ryba/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ryba';
const externalDatabaseName = 'ryba_external_s10';
const externalReaderRole = 'ryba_external_reader';
const externalReaderPassword = 'ReaderPassword123!';
const externalTableName = 'invoice_snapshots';

describe('S-10 integration', () => {
  let app: NestFastifyApplication;
  const pool = new Pool({
    connectionString: databaseUrl,
  });
  let externalAdminPool: Pool;
  let externalReaderConnectionString = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-s10-tests';
    process.env.JWT_EXPIRES_IN_SECONDS = process.env.JWT_EXPIRES_IN_SECONDS ?? '3600';
    process.env.API_CORS_ORIGIN = process.env.API_CORS_ORIGIN ?? '*';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.enableCors();

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    await cleanDatabase();
    externalReaderConnectionString = await ensureExternalDatabase();
    await reseedExternalDatabase();
  });

  afterEach(async () => {
    await cleanDatabase();
    await reseedExternalDatabase();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    await externalAdminPool?.end();
  });

  it('connects a workspace data source, executes a group-scoped saved query and publishes the output to a document', async () => {
    const ownerToken = await bootstrapUserAndGetToken('s10-owner@ryba.local');
    const editorToken = await bootstrapUserAndGetToken('s10-editor@ryba.local');

    const workspace = await createWorkspace(ownerToken, 'Data Workspace', 'data-workspace');
    const space = await createSpace(ownerToken, workspace.id, 'Revenue', 'revenue');
    const group = await createGroup(ownerToken, space.id, 'Enterprise', 'enterprise');
    await inviteMember(ownerToken, workspace.id, 's10-editor@ryba.local', 'editor');

    const createDataSourceResponse = await request(app.getHttpServer())
      .post(`/workspaces/${workspace.id}/data-sources`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Finance Warehouse',
        description: 'Read only billing dataset',
        connectionString: externalReaderConnectionString,
      })
      .expect(201);

    const dataSource = unwrap<DataSourceRecord>(createDataSourceResponse.body);
    dataSourceRecordSchema.parse(dataSource);
    expect(dataSource.kind).toBe('postgres');
    expect(dataSource.databaseName).toBe(externalDatabaseName);

    const createSavedQueryResponse = await request(app.getHttpServer())
      .post(`/groups/${group.id}/saved-queries`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        name: 'Overdue invoices',
        description: 'Rows that need collection follow-up',
        dataSourceId: dataSource.id,
        sqlTemplate: `
          select company_id, customer_name, overdue_amount, status, created_at
          from invoice_snapshots
          where status = {{status}}
          order by overdue_amount desc
        `,
        parameterDefinitions: [
          {
            name: 'status',
            label: 'Status',
            type: 'text',
            required: true,
            defaultValue: 'overdue',
          },
        ],
      })
      .expect(201);

    const savedQuery = unwrap<SavedQueryRecord>(createSavedQueryResponse.body);
    savedQueryRecordSchema.parse(savedQuery);
    expect(savedQuery.groupId).toBe(group.id);

    const executeResponse = await request(app.getHttpServer())
      .post(`/saved-queries/${savedQuery.id}/execute`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        parameters: {
          status: 'overdue',
        },
      })
      .expect(200);

    const run = unwrap<QueryRunRecord>(executeResponse.body);
    queryRunRecordSchema.parse(run);
    expect(run.status).toBe('succeeded');
    expect(run.rowCount).toBe(2);
    expect(run.columns.map((column) => column.label)).toEqual([
      'company_id',
      'customer_name',
      'overdue_amount',
      'status',
      'created_at',
    ]);
    expect(run.rows[0]?.customer_name).toBe('Northwind');

    const runsResponse = await request(app.getHttpServer())
      .get(`/saved-queries/${savedQuery.id}/runs`)
      .set('Authorization', `Bearer ${editorToken}`)
      .expect(200);

    const runs = unwrap<{ items: QueryRunRecord[] }>(runsResponse.body);
    listQueryRunsResponseSchema.parse(runs);
    expect(runs.items[0]?.id).toBe(run.id);

    const publishResponse = await request(app.getHttpServer())
      .post(`/query-runs/${run.id}/publish-document`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        title: 'Overdue invoices snapshot',
      })
      .expect(200);

    const publishedDocument = unwrap<DocumentDetailRecord>(publishResponse.body);
    documentDetailRecordSchema.parse(publishedDocument);
    expect(publishedDocument.document.groupId).toBe(group.id);
    expect(publishedDocument.document.title).toBe('Overdue invoices snapshot');
    expect(publishedDocument.document.previewText).toContain('Northwind');

    const activityResponse = await request(app.getHttpServer())
      .get(`/workspaces/${workspace.id}/activity`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const activity = unwrap<{ items: ActivityEventRecord[] }>(activityResponse.body);
    listActivityEventsResponseSchema.parse(activity);
    expect(activity.items.map((item) => item.eventType)).toEqual(
      expect.arrayContaining([
        'data_source.created',
        'saved_query.created',
        'saved_query.executed',
        'saved_query.published',
      ]),
    );
  });

  it('keeps management actions restricted while allowing viewers to run existing read-only queries', async () => {
    const ownerToken = await bootstrapUserAndGetToken('s10-view-owner@ryba.local');
    const viewerToken = await bootstrapUserAndGetToken('s10-view-viewer@ryba.local');

    const workspace = await createWorkspace(ownerToken, 'Viewer Workspace', 'viewer-data-workspace');
    const space = await createSpace(ownerToken, workspace.id, 'Support', 'support');
    await inviteMember(ownerToken, workspace.id, 's10-view-viewer@ryba.local', 'viewer');

    const dataSource = await createDataSource(ownerToken, workspace.id);

    const queryResponse = await request(app.getHttpServer())
      .post(`/spaces/${space.id}/saved-queries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Recent invoices',
        dataSourceId: dataSource.id,
        sqlTemplate: `
          select company_id, customer_name, overdue_amount
          from invoice_snapshots
          where created_at >= {{created_after}}
          order by created_at desc
        `,
        parameterDefinitions: [
          {
            name: 'created_after',
            label: 'Created after',
            type: 'date',
            required: true,
            defaultValue: '2026-04-01',
          },
        ],
      })
      .expect(201);

    const savedQuery = unwrap<SavedQueryRecord>(queryResponse.body);

    await request(app.getHttpServer())
      .post(`/workspaces/${workspace.id}/data-sources`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        name: 'Blocked source',
        connectionString: externalReaderConnectionString,
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/spaces/${space.id}/saved-queries`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        name: 'Blocked query',
        dataSourceId: dataSource.id,
        sqlTemplate: 'select 1',
        parameterDefinitions: [],
      })
      .expect(403);

    const executeResponse = await request(app.getHttpServer())
      .post(`/saved-queries/${savedQuery.id}/execute`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        parameters: {
          created_after: '2026-04-01',
        },
      })
      .expect(200);

    const run = unwrap<QueryRunRecord>(executeResponse.body);
    expect(run.status).toBe('succeeded');
    expect(run.rowCount).toBeGreaterThan(0);

    const unsafeResponse = await request(app.getHttpServer())
      .post(`/spaces/${space.id}/saved-queries`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Unsafe query',
        dataSourceId: dataSource.id,
        sqlTemplate: 'select * from invoice_snapshots; delete from invoice_snapshots',
        parameterDefinitions: [],
      })
      .expect(400);

    expect(unsafeResponse.body.ok).toBe(false);
    expect(unsafeResponse.body.error.code).toBe('VALIDATION_ERROR');

    const dataSourcesResponse = await request(app.getHttpServer())
      .get(`/workspaces/${workspace.id}/data-sources`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);

    const dataSources = unwrap<{ items: DataSourceRecord[] }>(dataSourcesResponse.body);
    listDataSourcesResponseSchema.parse(dataSources);
    expect(dataSources.items).toHaveLength(1);

    const savedQueriesResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/saved-queries`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);

    const savedQueries = unwrap<{ items: SavedQueryRecord[] }>(savedQueriesResponse.body);
    listSavedQueriesResponseSchema.parse(savedQueries);
    expect(savedQueries.items).toHaveLength(1);
  });

  const bootstrapUserAndGetToken = async (email: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'Password123',
        displayName: 'S10 Tester',
      })
      .expect(201);

    const session = unwrap<AuthSession>(response.body);
    authSessionSchema.parse(session);

    return session.accessToken;
  };

  const createWorkspace = async (
    token: string,
    name: string,
    slug: string,
  ): Promise<WorkspaceRecord> => {
    const response = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, slug })
      .expect(201);

    const workspace = unwrap<WorkspaceRecord>(response.body);
    workspaceRecordSchema.parse(workspace);

    return workspace;
  };

  const createSpace = async (
    token: string,
    workspaceId: string,
    name: string,
    slug: string,
  ): Promise<SpaceRecord> => {
    const response = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/spaces`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name, slug })
      .expect(201);

    const space = unwrap<SpaceRecord>(response.body);
    spaceRecordSchema.parse(space);

    return space;
  };

  const createGroup = async (token: string, spaceId: string, name: string, slug: string) => {
    const response = await request(app.getHttpServer())
      .post(`/spaces/${spaceId}/groups`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name, slug })
      .expect(201);

    return unwrap<{ id: string; spaceId: string; workspaceId: string }>(response.body);
  };

  const inviteMember = async (
    token: string,
    workspaceId: string,
    email: string,
    role: 'editor' | 'viewer',
  ): Promise<WorkspaceMemberDetailRecord> => {
    const response = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        email,
        role,
      })
      .expect(201);

    return unwrap<WorkspaceMemberDetailRecord>(response.body);
  };

  const createDataSource = async (token: string, workspaceId: string) => {
    const response = await request(app.getHttpServer())
      .post(`/workspaces/${workspaceId}/data-sources`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Shared external source',
        description: 'Read only integration test source',
        connectionString: externalReaderConnectionString,
      })
      .expect(201);

    return unwrap<DataSourceRecord>(response.body);
  };

  const cleanDatabase = async () => {
    await pool.query(
      [
        'TRUNCATE TABLE',
        'query_runs, saved_queries, data_sources, activity_events, group_canvas_states, groups, saved_views, document_entity_mentions, documents, space_canvas_states, relations, entities, entity_type_fields, entity_types, spaces, workspace_members, workspaces, users',
        'RESTART IDENTITY CASCADE',
      ].join(' '),
    );
  };

  const ensureExternalDatabase = async () => {
    const adminPool = new Pool({
      connectionString: databaseUrl,
    });
    const databaseExists = await adminPool.query(
      'select 1 from pg_database where datname = $1',
      [externalDatabaseName],
    );

    if (databaseExists.rowCount === 0) {
      await adminPool.query(`create database "${externalDatabaseName}"`);
    }

    const roleExists = await adminPool.query('select 1 from pg_roles where rolname = $1', [
      externalReaderRole,
    ]);

    if (roleExists.rowCount === 0) {
      await adminPool.query(
        `create role "${externalReaderRole}" with login password '${externalReaderPassword}'`,
      );
    } else {
      await adminPool.query(
        `alter role "${externalReaderRole}" with login password '${externalReaderPassword}'`,
      );
    }

    await adminPool.query(`grant connect on database "${externalDatabaseName}" to "${externalReaderRole}"`);

    externalAdminPool = new Pool({
      connectionString: replaceDatabaseInUrl(databaseUrl, externalDatabaseName),
    });

    await externalAdminPool.query(`
      create table if not exists public.${externalTableName} (
        company_id text not null,
        customer_name text not null,
        overdue_amount numeric(12, 2) not null,
        status text not null,
        created_at date not null
      )
    `);
    await externalAdminPool.query(`grant usage on schema public to "${externalReaderRole}"`);
    await externalAdminPool.query(
      `grant select on table public.${externalTableName} to "${externalReaderRole}"`,
    );

    await adminPool.end();

    return replaceDatabaseInUrl(
      databaseUrl,
      externalDatabaseName,
      externalReaderRole,
      externalReaderPassword,
    );
  };

  const reseedExternalDatabase = async () => {
    await externalAdminPool.query(`truncate table public.${externalTableName}`);
    await externalAdminPool.query(
      `
        insert into public.${externalTableName}
          (company_id, customer_name, overdue_amount, status, created_at)
        values
          ('acme', 'Acme Corp', 1200.50, 'paid', '2026-04-01'),
          ('northwind', 'Northwind', 5300.00, 'overdue', '2026-04-05'),
          ('contoso', 'Contoso', 2100.25, 'overdue', '2026-04-03'),
          ('fabrikam', 'Fabrikam', 700.00, 'draft', '2026-03-25')
      `,
    );
  };
});

const unwrap = <TData>(envelope: ApiEnvelope<TData>): TData => {
  if (!envelope.ok) {
    throw new Error(`${envelope.error.code}: ${envelope.error.message}`);
  }

  return envelope.data;
};

const replaceDatabaseInUrl = (
  input: string,
  databaseName: string,
  username?: string,
  password?: string,
) => {
  const url = new URL(input);
  url.pathname = `/${databaseName}`;

  if (username) {
    url.username = username;
  }

  if (password) {
    url.password = password;
  }

  return url.toString();
};
