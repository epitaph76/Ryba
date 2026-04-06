import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { Pool } from 'pg';
import {
  authSessionSchema,
  entityRecordSchema,
  listEntityTypesResponseSchema,
  listSavedViewsResponseSchema,
  savedViewRecordSchema,
  spaceRecordSchema,
  workspaceRecordSchema,
} from '@ryba/schemas';
import type {
  ApiEnvelope,
  AuthSession,
  EntityRecord,
  EntityTypeRecord,
  SavedViewRecord,
  SpaceRecord,
  WorkspaceRecord,
} from '@ryba/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ryba';

describe('S-6 integration', () => {
  let app: NestFastifyApplication;
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-s6-tests';
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
  });

  afterEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('persists saved views for typed entities and restores updated config', async () => {
    const token = await bootstrapUserAndGetToken('s6-table@ryba.local');
    const workspace = await createWorkspace(token, 'Table Workspace', 'table-workspace');
    const space = await createSpace(token, workspace.id, 'Operations', 'operations');
    const taskType = await getEntityTypeBySlug(token, workspace.id, 'task');

    await createEntity(token, space.id, {
      entityTypeId: taskType.id,
      title: 'Follow up with Acme',
      summary: 'Sales task',
      properties: {
        status: 'todo',
        priority: 'high',
        due_date: '2026-04-08',
      },
    });
    await createEntity(token, space.id, {
      entityTypeId: taskType.id,
      title: 'Prepare weekly review',
      summary: 'Ops task',
      properties: {
        status: 'in_progress',
        priority: 'medium',
        due_date: '2026-04-10',
      },
    });

    const createResponse = await request(app.getHttpServer())
      .post(`/spaces/${space.id}/saved-views`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'My open tasks',
        entityTypeId: taskType.id,
        viewType: 'table',
        config: {
          filters: [
            {
              id: 'filter-status',
              key: 'status',
              source: 'property',
              operator: 'equals',
              value: 'todo',
            },
          ],
          sort: [
            {
              key: 'due_date',
              source: 'property',
              direction: 'asc',
            },
          ],
          columns: [
            {
              key: 'title',
              source: 'system',
              visible: true,
              width: 320,
            },
            {
              key: 'status',
              source: 'property',
              visible: true,
              width: 180,
            },
          ],
        },
      })
      .expect(201);

    const createdSavedView = unwrap<SavedViewRecord>(createResponse.body);
    savedViewRecordSchema.parse(createdSavedView);
    expect(createdSavedView.name).toBe('My open tasks');
    expect(createdSavedView.entityTypeId).toBe(taskType.id);
    expect(createdSavedView.viewType).toBe('table');
    expect(createdSavedView.config.filters).toEqual([
      expect.objectContaining({
        key: 'status',
        source: 'property',
        operator: 'equals',
        value: 'todo',
      }),
    ]);

    const listResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/saved-views`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const list = unwrap<{ items: SavedViewRecord[] }>(listResponse.body);
    listSavedViewsResponseSchema.parse(list);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.id).toBe(createdSavedView.id);

    const updateResponse = await request(app.getHttpServer())
      .patch(`/saved-views/${createdSavedView.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'My active tasks',
        viewType: 'list',
        config: {
          filters: [
            {
              id: 'filter-status',
              key: 'status',
              source: 'property',
              operator: 'not_equals',
              value: 'done',
            },
          ],
          sort: [
            {
              key: 'updatedAt',
              source: 'system',
              direction: 'desc',
            },
          ],
          columns: [
            {
              key: 'title',
              source: 'system',
              visible: true,
              width: null,
            },
          ],
        },
      })
      .expect(200);

    const updatedSavedView = unwrap<SavedViewRecord>(updateResponse.body);
    savedViewRecordSchema.parse(updatedSavedView);
    expect(updatedSavedView.name).toBe('My active tasks');
    expect(updatedSavedView.viewType).toBe('list');
    expect(updatedSavedView.config.sort).toEqual([
      expect.objectContaining({
        key: 'updatedAt',
        source: 'system',
        direction: 'desc',
      }),
    ]);

    const restoredResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/saved-views`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const restored = unwrap<{ items: SavedViewRecord[] }>(restoredResponse.body);
    listSavedViewsResponseSchema.parse(restored);
    expect(restored.items).toEqual([
      expect.objectContaining({
        id: createdSavedView.id,
        name: 'My active tasks',
        viewType: 'list',
        config: expect.objectContaining({
          filters: [
            expect.objectContaining({
              operator: 'not_equals',
              value: 'done',
            }),
          ],
        }),
      }),
    ]);

    await request(app.getHttpServer())
      .delete(`/saved-views/${createdSavedView.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const afterDeleteResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/saved-views`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const afterDelete = unwrap<{ items: SavedViewRecord[] }>(afterDeleteResponse.body);
    listSavedViewsResponseSchema.parse(afterDelete);
    expect(afterDelete.items).toEqual([]);
  });

  it('rejects saved views that point to an entity type from another workspace', async () => {
    const tokenOne = await bootstrapUserAndGetToken('s6-primary@ryba.local');
    const tokenTwo = await bootstrapUserAndGetToken('s6-secondary@ryba.local');
    const primaryWorkspace = await createWorkspace(tokenOne, 'Primary', 'primary');
    const secondaryWorkspace = await createWorkspace(tokenTwo, 'Secondary', 'secondary');
    const primarySpace = await createSpace(tokenOne, primaryWorkspace.id, 'General', 'general');
    const foreignType = await getEntityTypeBySlug(tokenTwo, secondaryWorkspace.id, 'task');

    const response = await request(app.getHttpServer())
      .post(`/spaces/${primarySpace.id}/saved-views`)
      .set('Authorization', `Bearer ${tokenOne}`)
      .send({
        name: 'Broken view',
        entityTypeId: foreignType.id,
        viewType: 'table',
        config: {
          filters: [],
          sort: [],
          columns: [],
        },
      })
      .expect(400);

    expect(response.body.ok).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  const bootstrapUserAndGetToken = async (email: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'Password123',
        displayName: 'Table Tester',
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

  const getEntityTypeBySlug = async (
    token: string,
    workspaceId: string,
    slug: string,
  ): Promise<EntityTypeRecord> => {
    const response = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceId}/entity-types`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const list = unwrap<{ items: EntityTypeRecord[] }>(response.body);
    listEntityTypesResponseSchema.parse(list);
    const entityType = list.items.find((item) => item.slug === slug);

    if (!entityType) {
      throw new Error(`Entity type ${slug} was not seeded`);
    }

    return entityType;
  };

  const createEntity = async (
    token: string,
    spaceId: string,
    input: {
      entityTypeId?: string | null;
      title: string;
      summary?: string | null;
      properties?: Record<string, unknown>;
    },
  ): Promise<EntityRecord> => {
    const response = await request(app.getHttpServer())
      .post(`/spaces/${spaceId}/entities`)
      .set('Authorization', `Bearer ${token}`)
      .send(input)
      .expect(201);

    const entity = unwrap<EntityRecord>(response.body);
    entityRecordSchema.parse(entity);

    return entity;
  };

  const cleanDatabase = async () => {
    await pool.query(
      [
        'TRUNCATE TABLE',
        'saved_views, document_entity_mentions, documents, space_canvas_states, relations, entities, entity_type_fields, entity_types, spaces, workspace_members, workspaces, users',
        'RESTART IDENTITY CASCADE',
      ].join(' '),
    );
  };
});

const unwrap = <TData>(envelope: ApiEnvelope<TData>): TData => {
  if (!envelope.ok) {
    throw new Error(`${envelope.error.code}: ${envelope.error.message}`);
  }

  return envelope.data;
};
