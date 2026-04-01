import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { Pool } from 'pg';
import {
  authSessionSchema,
  canvasStateRecordSchema,
  entityRecordSchema,
  relationRecordSchema,
  spaceRecordSchema,
  workspaceRecordSchema,
} from '@ryba/schemas';
import type {
  ApiEnvelope,
  AuthSession,
  CanvasStateRecord,
  EntityRecord,
  RelationRecord,
  SpaceRecord,
  WorkspaceRecord,
} from '@ryba/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ryba';

describe('S-3 integration', () => {
  let app: NestFastifyApplication;
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-s3-tests';
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

  it('returns a usable canvas state from real entities and relations when no layout was saved yet', async () => {
    const token = await bootstrapUserAndGetToken('canvas-default@ryba.local');
    const workspace = await createWorkspace(token, 'Canvas Default', 'canvas-default');
    const space = await createSpace(token, workspace.id, 'General', 'general');
    const entityA = await createEntity(token, space.id, 'Entity A');
    const entityB = await createEntity(token, space.id, 'Entity B');
    const relation = await createRelation(token, space.id, entityA.id, entityB.id, 'depends_on');

    const response = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/canvas`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const canvas = unwrap<CanvasStateRecord>(response.body);
    canvasStateRecordSchema.parse(canvas);

    expect(canvas.spaceId).toBe(space.id);
    expect(canvas.updatedAt).toBeNull();
    expect(canvas.nodes).toHaveLength(2);
    expect(canvas.edges).toHaveLength(1);
    expect(canvas.nodes.map((node) => node.entityId)).toEqual([entityA.id, entityB.id]);
    expect(canvas.edges[0]).toMatchObject({
      relationId: relation.id,
      fromEntityId: entityA.id,
      toEntityId: entityB.id,
    });
  });

  it('saves and loads canvas state with preferred S3 contract', async () => {
    const token = await bootstrapUserAndGetToken('canvas-save@ryba.local');
    const workspace = await createWorkspace(token, 'Canvas Save', 'canvas-save');
    const space = await createSpace(token, workspace.id, 'Ops', 'ops');
    const entityA = await createEntity(token, space.id, 'Alpha');
    const entityB = await createEntity(token, space.id, 'Beta');
    const relation = await createRelation(token, space.id, entityA.id, entityB.id, 'related_to');

    const payload = {
      nodes: [
        {
          entityId: entityA.id,
          position: { x: 120, y: 80 },
          size: { width: 260, height: 120 },
          zIndex: 4,
          collapsed: false,
        },
        {
          entityId: entityB.id,
          position: { x: 520, y: 220 },
          size: null,
          zIndex: 5,
          collapsed: true,
        },
      ],
      edges: [
        {
          relationId: relation.id,
          fromEntityId: entityA.id,
          toEntityId: entityB.id,
          controlPoints: [{ x: 300, y: 140 }],
        },
      ],
      viewport: {
        zoom: 1.4,
        offset: { x: -120, y: 64 },
      },
    };

    const saveResponse = await request(app.getHttpServer())
      .put(`/spaces/${space.id}/canvas`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(200);

    const saved = unwrap<CanvasStateRecord>(saveResponse.body);
    canvasStateRecordSchema.parse(saved);
    expect(saved.updatedAt).not.toBeNull();
    expect(saved.nodes).toEqual(payload.nodes);
    expect(saved.edges).toEqual(payload.edges);
    expect(saved.viewport).toEqual(payload.viewport);

    const loadResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/canvas`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const loaded = unwrap<CanvasStateRecord>(loadResponse.body);
    canvasStateRecordSchema.parse(loaded);
    expect(loaded).toEqual(saved);
  });

  it('blocks cross-workspace canvas access', async () => {
    const tokenOne = await bootstrapUserAndGetToken('canvas-first@ryba.local');
    const tokenTwo = await bootstrapUserAndGetToken('canvas-second@ryba.local');
    const workspace = await createWorkspace(tokenTwo, 'Second Canvas', 'second-canvas');
    const space = await createSpace(tokenTwo, workspace.id, 'Private', 'private');

    const response = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/canvas`)
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
        displayName: 'Canvas Tester',
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

    const entity = unwrap<EntityRecord>(response.body);
    entityRecordSchema.parse(entity);

    return entity;
  };

  const createRelation = async (
    token: string,
    spaceId: string,
    fromEntityId: string,
    toEntityId: string,
    relationType: string,
  ): Promise<RelationRecord> => {
    const response = await request(app.getHttpServer())
      .post(`/spaces/${spaceId}/relations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fromEntityId,
        toEntityId,
        relationType,
        properties: {},
      })
      .expect(201);

    const relation = unwrap<RelationRecord>(response.body);
    relationRecordSchema.parse(relation);

    return relation;
  };

  const cleanDatabase = async () => {
    await pool.query(
      [
        'TRUNCATE TABLE',
        'space_canvas_states, relations, entities, spaces, workspace_members, workspaces, users',
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
