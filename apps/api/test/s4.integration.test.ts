import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { Pool } from 'pg';
import {
  authSessionSchema,
  entityRecordSchema,
  entityTypeRecordSchema,
  listEntityTypesResponseSchema,
  spaceRecordSchema,
  workspaceRecordSchema,
} from '@ryba/schemas';
import type {
  ApiEnvelope,
  AuthSession,
  EntityRecord,
  EntityTypeRecord,
  SpaceRecord,
  WorkspaceRecord,
} from '@ryba/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ryba';

describe('S-4 integration', () => {
  let app: NestFastifyApplication;
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-s4-tests';
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

  it('seeds default entity types and validates typed entity properties', async () => {
    const token = await bootstrapUserAndGetToken('s4-defaults@ryba.local');
    const workspace = await createWorkspace(token, 'Schema Workspace', 'schema-workspace');
    const space = await createSpace(token, workspace.id, 'General', 'general');

    const typesResponse = await request(app.getHttpServer())
      .get(`/workspaces/${workspace.id}/entity-types`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const typeList = unwrap<{ items: EntityTypeRecord[] }>(typesResponse.body);
    listEntityTypesResponseSchema.parse(typeList);
    expect(typeList.items.map((item) => item.slug)).toEqual(
      expect.arrayContaining(['company', 'contact', 'task', 'note', 'project']),
    );

    const taskType = typeList.items.find((item) => item.slug === 'task');
    expect(taskType).toBeDefined();

    const entityResponse = await request(app.getHttpServer())
      .post(`/spaces/${space.id}/entities`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        entityTypeId: taskType?.id,
        title: 'Ship S4',
        summary: 'Typed task entity',
        properties: {
          status: 'todo',
          priority: 'high',
          due_date: '2026-04-15',
          is_blocked: false,
        },
      })
      .expect(201);

    const entity = unwrap<EntityRecord>(entityResponse.body);
    entityRecordSchema.parse(entity);
    expect(entity.entityTypeId).toBe(taskType?.id);
    expect(entity.properties).toMatchObject({
      status: 'todo',
      priority: 'high',
      due_date: '2026-04-15',
      is_blocked: false,
    });

    const invalidUpdateResponse = await request(app.getHttpServer())
      .patch(`/entities/${entity.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        properties: {
          status: 'unknown',
        },
      })
      .expect(400);

    expect(invalidUpdateResponse.body.ok).toBe(false);
    expect(invalidUpdateResponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates and updates a custom entity type with field definitions', async () => {
    const token = await bootstrapUserAndGetToken('s4-custom@ryba.local');
    const workspace = await createWorkspace(token, 'Custom Workspace', 'custom-workspace');
    const space = await createSpace(token, workspace.id, 'Ops', 'ops');

    const createTypeResponse = await request(app.getHttpServer())
      .post(`/workspaces/${workspace.id}/entity-types`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Vendor',
        slug: 'vendor',
        description: 'External supplier record',
        color: '#1d2939',
        icon: 'truck',
        fields: [
          {
            key: 'website',
            label: 'Website',
            fieldType: 'url',
          },
          {
            key: 'tags',
            label: 'Tags',
            fieldType: 'multi_select',
            config: {
              options: [
                { value: 'core', label: 'Core', color: null },
                { value: 'pilot', label: 'Pilot', color: null },
              ],
              allowMultiple: true,
            },
          },
        ],
      })
      .expect(201);

    const createdType = unwrap<EntityTypeRecord>(createTypeResponse.body);
    entityTypeRecordSchema.parse(createdType);
    expect(createdType.fields).toHaveLength(2);

    const updateTypeResponse = await request(app.getHttpServer())
      .patch(`/entity-types/${createdType.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'External supplier profile',
        fields: [
          {
            key: 'website',
            label: 'Website',
            fieldType: 'url',
          },
          {
            key: 'is_preferred',
            label: 'Preferred',
            fieldType: 'boolean',
          },
        ],
      })
      .expect(200);

    const updatedType = unwrap<EntityTypeRecord>(updateTypeResponse.body);
    entityTypeRecordSchema.parse(updatedType);
    expect(updatedType.description).toBe('External supplier profile');
    expect(updatedType.fields.map((field) => field.key)).toEqual(['website', 'is_preferred']);

    const validEntityResponse = await request(app.getHttpServer())
      .post(`/spaces/${space.id}/entities`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        entityTypeId: createdType.id,
        title: 'Acme Supply',
        properties: {
          website: 'https://acme.example',
          is_preferred: true,
        },
      })
      .expect(201);

    const entity = unwrap<EntityRecord>(validEntityResponse.body);
    entityRecordSchema.parse(entity);
    expect(entity.properties).toMatchObject({
      website: 'https://acme.example',
      is_preferred: true,
    });

    const invalidEntityResponse = await request(app.getHttpServer())
      .post(`/spaces/${space.id}/entities`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        entityTypeId: createdType.id,
        title: 'Broken Vendor',
        properties: {
          website: 'not-a-url',
        },
      })
      .expect(400);

    expect(invalidEntityResponse.body.ok).toBe(false);
    expect(invalidEntityResponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('blocks cross-workspace access to entity types', async () => {
    const tokenOne = await bootstrapUserAndGetToken('s4-first@ryba.local');
    const tokenTwo = await bootstrapUserAndGetToken('s4-second@ryba.local');
    const workspace = await createWorkspace(tokenTwo, 'Private Schema', 'private-schema');

    const response = await request(app.getHttpServer())
      .get(`/workspaces/${workspace.id}/entity-types`)
      .set('Authorization', `Bearer ${tokenOne}`)
      .expect(403);

    expect(response.body.ok).toBe(false);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  const bootstrapUserAndGetToken = async (email: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'Password123',
        displayName: 'Schema Tester',
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

  const cleanDatabase = async () => {
    await pool.query(
      [
        'TRUNCATE TABLE',
        'space_canvas_states, relations, entities, entity_type_fields, entity_types, spaces, workspace_members, workspaces, users',
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
