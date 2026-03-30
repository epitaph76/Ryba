import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { Pool } from 'pg';
import {
  authSessionSchema,
  entityRecordSchema,
  listEntitiesResponseSchema,
  listRelationsResponseSchema,
  relationRecordSchema,
  spaceRecordSchema,
  userRecordSchema,
  workspaceRecordSchema,
} from '@ryba/schemas';
import type { ApiEnvelope, AuthSession, EntityRecord, RelationRecord, SpaceRecord, WorkspaceRecord } from '@ryba/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ryba';

describe('S-2 integration', () => {
  let app: NestFastifyApplication;
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-s2-tests';
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

  it('runs full core flow: auth -> workspace -> space -> entity -> relation', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'demo@ryba.local',
        password: 'Password123',
        displayName: 'Demo',
      })
      .expect(201);

    const registerData = unwrap<AuthSession>(registerResponse.body);
    authSessionSchema.parse(registerData);
    const token = registerData.accessToken;

    const meResponse = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const meData = unwrap(meResponse.body);
    userRecordSchema.parse(meData);
    expect(meData.email).toBe('demo@ryba.local');

    const workspaceResponse = await request(app.getHttpServer())
      .post('/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Main Workspace',
        slug: 'main-workspace',
      })
      .expect(201);
    const workspace = unwrap<WorkspaceRecord>(workspaceResponse.body);
    workspaceRecordSchema.parse(workspace);

    const spaceResponse = await request(app.getHttpServer())
      .post(`/workspaces/${workspace.id}/spaces`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'General',
        slug: 'general',
      })
      .expect(201);
    const space = unwrap<SpaceRecord>(spaceResponse.body);
    spaceRecordSchema.parse(space);

    const entityAResponse = await request(app.getHttpServer())
      .post(`/spaces/${space.id}/entities`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Entity A',
        summary: 'First entity',
        properties: { priority: 'high' },
      })
      .expect(201);
    const entityA = unwrap<EntityRecord>(entityAResponse.body);
    entityRecordSchema.parse(entityA);

    const entityBResponse = await request(app.getHttpServer())
      .post(`/spaces/${space.id}/entities`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Entity B',
        summary: 'Second entity',
        properties: { priority: 'medium' },
      })
      .expect(201);
    const entityB = unwrap<EntityRecord>(entityBResponse.body);
    entityRecordSchema.parse(entityB);

    const relationResponse = await request(app.getHttpServer())
      .post(`/spaces/${space.id}/relations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fromEntityId: entityA.id,
        toEntityId: entityB.id,
        relationType: 'depends_on',
        properties: {},
      })
      .expect(201);
    const relation = unwrap<RelationRecord>(relationResponse.body);
    relationRecordSchema.parse(relation);
    expect(relation.relationType).toBe('depends_on');

    const listEntitiesResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/entities`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const entitiesList = unwrap<{ items: EntityRecord[] }>(listEntitiesResponse.body);
    listEntitiesResponseSchema.parse(entitiesList);
    expect(entitiesList.items).toHaveLength(2);

    const listRelationsResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/relations`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const relationsList = unwrap<{ items: RelationRecord[] }>(listRelationsResponse.body);
    listRelationsResponseSchema.parse(relationsList);
    expect(relationsList.items).toHaveLength(1);
  });

  it('returns validation error for relation with missing entity', async () => {
    const token = await bootstrapUserAndGetToken('one@ryba.local');
    const workspace = await createWorkspace(token, 'alpha', 'alpha');
    const space = await createSpace(token, workspace.id, 'ops', 'ops');
    const entity = await createEntity(token, space.id, 'A');

    const response = await request(app.getHttpServer())
      .post(`/spaces/${space.id}/relations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fromEntityId: entity.id,
        toEntityId: 'missing',
        relationType: 'linked',
      })
      .expect(400);

    expect(response.body.ok).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('blocks cross-workspace access', async () => {
    const tokenOne = await bootstrapUserAndGetToken('first@ryba.local');
    const tokenTwo = await bootstrapUserAndGetToken('second@ryba.local');
    const workspaceTwo = await createWorkspace(tokenTwo, 'Second', 'second');

    const response = await request(app.getHttpServer())
      .get(`/workspaces/${workspaceTwo.id}/spaces`)
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
        displayName: 'Demo',
      })
      .expect(201);

    return unwrap<AuthSession>(response.body).accessToken;
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

    return unwrap<WorkspaceRecord>(response.body);
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

    return unwrap<SpaceRecord>(response.body);
  };

  const createEntity = async (
    token: string,
    spaceId: string,
    title: string,
  ): Promise<EntityRecord> => {
    const response = await request(app.getHttpServer())
      .post(`/spaces/${spaceId}/entities`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title,
        summary: null,
        properties: {},
      })
      .expect(201);

    return unwrap<EntityRecord>(response.body);
  };

  const cleanDatabase = async () => {
    await pool.query(
      [
        'TRUNCATE TABLE',
        'relations, entities, spaces, workspace_members, workspaces, users',
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
