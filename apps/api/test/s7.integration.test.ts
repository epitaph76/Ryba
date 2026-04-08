import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { Pool } from 'pg';
import {
  authSessionSchema,
  entityRecordSchema,
  listDocumentsResponseSchema,
  listEntitiesResponseSchema,
  listRelationsResponseSchema,
  listSavedViewsResponseSchema,
  listSpacesResponseSchema,
  workspaceRecordSchema,
} from '@ryba/schemas';
import type {
  ApiEnvelope,
  AuthSession,
  CanvasStateRecord,
  DocumentRecord,
  EntityRecord,
  RelationRecord,
  SavedViewRecord,
  SpaceRecord,
  WorkspaceRecord,
} from '@ryba/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ryba';

type GroupRecord = {
  id: string;
  workspaceId: string;
  spaceId: string;
  createdByUserId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

describe('S-7 integration', () => {
  let app: NestFastifyApplication;
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-s7-tests';
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

  it('creates group subspaces and keeps their entities, documents, views and canvas local', async () => {
    const token = await bootstrapUserAndGetToken('s7-subspace@ryba.local');
    const workspace = await createWorkspace(token, 'Subspace Workspace', 'subspace-workspace');
    const space = await createSpace(token, workspace.id, 'Sales', 'sales');
    const rootEntity = await createEntity(token, space.id, {
      title: 'Workspace-wide company',
      summary: 'Visible in the outer space',
    });

    const group = await createGroup(token, space.id, {
      name: 'Enterprise Clients',
      slug: 'enterprise-clients',
      description: 'Deal room for enterprise accounts',
    });

    const groupEntityOne = await createGroupEntity(token, group.id, {
      title: 'Acme rollout',
      summary: 'Scoped to the group',
    });
    const groupEntityTwo = await createGroupEntity(token, group.id, {
      title: 'Beta renewal',
      summary: 'Also scoped to the group',
    });

    const relationResponse = await request(app.getHttpServer())
      .post(`/groups/${group.id}/relations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fromEntityId: groupEntityOne.id,
        toEntityId: groupEntityTwo.id,
        relationType: 'depends_on',
        properties: {},
      })
      .expect(201);

    const createdRelation = unwrap<RelationRecord>(relationResponse.body);
    expect(createdRelation.spaceId).toBe(space.id);
    expect(createdRelation.groupId).toBe(group.id);

    const documentResponse = await request(app.getHttpServer())
      .post(`/groups/${group.id}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Enterprise notes',
        body: [],
      })
      .expect(201);

    const createdDocumentDetail = unwrap<{ document: DocumentRecord } & Record<string, unknown>>(
      documentResponse.body,
    );
    expect(createdDocumentDetail.document.spaceId).toBe(space.id);
    expect(createdDocumentDetail.document.groupId).toBe(group.id);

    const savedViewResponse = await request(app.getHttpServer())
      .post(`/groups/${group.id}/saved-views`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Enterprise tasks',
        entityTypeId: null,
        viewType: 'table',
        config: {
          filters: [],
          sort: [],
          columns: [],
        },
      })
      .expect(201);

    const createdSavedView = unwrap<SavedViewRecord>(savedViewResponse.body);
    expect(createdSavedView.spaceId).toBe(space.id);
    expect(createdSavedView.groupId).toBe(group.id);

    const canvasSaveResponse = await request(app.getHttpServer())
      .put(`/groups/${group.id}/canvas`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        nodes: [
          {
            entityId: groupEntityOne.id,
            position: { x: 160, y: 120 },
            size: null,
            zIndex: 1,
            collapsed: false,
          },
          {
            entityId: groupEntityTwo.id,
            position: { x: 420, y: 220 },
            size: null,
            zIndex: 2,
            collapsed: false,
          },
        ],
        edges: [
          {
            relationId: createdRelation.id,
            fromEntityId: groupEntityOne.id,
            toEntityId: groupEntityTwo.id,
            controlPoints: [],
          },
        ],
        viewport: {
          zoom: 1.1,
          offset: { x: 24, y: -16 },
        },
      })
      .expect(200);

    const groupCanvas = unwrap<CanvasStateRecord>(canvasSaveResponse.body);
    expect(groupCanvas.spaceId).toBe(space.id);
    expect(groupCanvas.groupId).toBe(group.id);
    expect(groupCanvas.nodes.map((node) => node.entityId)).toEqual([
      groupEntityOne.id,
      groupEntityTwo.id,
      createdDocumentDetail.document.entityId,
    ]);

    const groupsResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/groups`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const groups = unwrap<{ items: GroupRecord[] }>(groupsResponse.body);
    expect(groups.items).toEqual([
      expect.objectContaining({
        id: group.id,
        spaceId: space.id,
        slug: 'enterprise-clients',
      }),
    ]);

    const rootEntitiesResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/entities`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const rootEntities = unwrap<{ items: EntityRecord[] }>(rootEntitiesResponse.body);
    listEntitiesResponseSchema.parse(rootEntities);
    expect(rootEntities.items.map((entity) => entity.id)).toEqual([rootEntity.id]);

    const groupEntitiesResponse = await request(app.getHttpServer())
      .get(`/groups/${group.id}/entities`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const groupEntities = unwrap<{ items: EntityRecord[] }>(groupEntitiesResponse.body);
    listEntitiesResponseSchema.parse(groupEntities);
    expect(groupEntities.items.map((entity) => entity.id)).toEqual([
      groupEntityOne.id,
      groupEntityTwo.id,
      createdDocumentDetail.document.entityId,
    ]);
    expect(groupEntities.items.every((entity) => entity.groupId === group.id)).toBe(true);

    const rootRelationsResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/relations`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const rootRelations = unwrap<{ items: RelationRecord[] }>(rootRelationsResponse.body);
    listRelationsResponseSchema.parse(rootRelations);
    expect(rootRelations.items).toEqual([]);

    const groupRelationsResponse = await request(app.getHttpServer())
      .get(`/groups/${group.id}/relations`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const groupRelations = unwrap<{ items: RelationRecord[] }>(groupRelationsResponse.body);
    listRelationsResponseSchema.parse(groupRelations);
    expect(groupRelations.items).toEqual([
      expect.objectContaining({
        id: createdRelation.id,
        groupId: group.id,
      }),
    ]);

    const rootDocumentsResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const rootDocuments = unwrap<{ items: DocumentRecord[] }>(rootDocumentsResponse.body);
    listDocumentsResponseSchema.parse(rootDocuments);
    expect(rootDocuments.items).toEqual([]);

    const groupDocumentsResponse = await request(app.getHttpServer())
      .get(`/groups/${group.id}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const groupDocuments = unwrap<{ items: DocumentRecord[] }>(groupDocumentsResponse.body);
    listDocumentsResponseSchema.parse(groupDocuments);
    expect(groupDocuments.items).toEqual([
      expect.objectContaining({
        id: createdDocumentDetail.document.id,
        groupId: group.id,
      }),
    ]);

    const rootSavedViewsResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/saved-views`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const rootSavedViews = unwrap<{ items: SavedViewRecord[] }>(rootSavedViewsResponse.body);
    listSavedViewsResponseSchema.parse(rootSavedViews);
    expect(rootSavedViews.items).toEqual([]);

    const groupSavedViewsResponse = await request(app.getHttpServer())
      .get(`/groups/${group.id}/saved-views`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const groupSavedViews = unwrap<{ items: SavedViewRecord[] }>(groupSavedViewsResponse.body);
    listSavedViewsResponseSchema.parse(groupSavedViews);
    expect(groupSavedViews.items).toEqual([
      expect.objectContaining({
        id: createdSavedView.id,
        groupId: group.id,
      }),
    ]);

    const rootCanvasResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/canvas`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const rootCanvas = unwrap<CanvasStateRecord>(rootCanvasResponse.body);
    expect(rootCanvas.groupId).toBeNull();
    expect(rootCanvas.nodes.map((node) => node.entityId)).toEqual([rootEntity.id]);
  });

  it('rejects cross-context relations between space root and group-local entities', async () => {
    const token = await bootstrapUserAndGetToken('s7-boundary@ryba.local');
    const workspace = await createWorkspace(token, 'Boundary Workspace', 'boundary-workspace');
    const space = await createSpace(token, workspace.id, 'Operations', 'operations');
    const rootEntity = await createEntity(token, space.id, {
      title: 'Outer task',
      summary: 'Root space',
    });
    const group = await createGroup(token, space.id, {
      name: 'Incident room',
      slug: 'incident-room',
      description: 'Inner context',
    });
    const groupEntity = await createGroupEntity(token, group.id, {
      title: 'Inner task',
      summary: 'Group-local',
    });

    const groupRelationResponse = await request(app.getHttpServer())
      .post(`/groups/${group.id}/relations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fromEntityId: groupEntity.id,
        toEntityId: rootEntity.id,
        relationType: 'depends_on',
        properties: {},
      })
      .expect(400);

    expect(groupRelationResponse.body.ok).toBe(false);
    expect(groupRelationResponse.body.error.code).toBe('VALIDATION_ERROR');

    const rootRelationResponse = await request(app.getHttpServer())
      .post(`/spaces/${space.id}/relations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fromEntityId: rootEntity.id,
        toEntityId: groupEntity.id,
        relationType: 'depends_on',
        properties: {},
      })
      .expect(400);

    expect(rootRelationResponse.body.ok).toBe(false);
    expect(rootRelationResponse.body.error.code).toBe('VALIDATION_ERROR');
  });

  const bootstrapUserAndGetToken = async (email: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'Password123',
        displayName: 'Subspace Tester',
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

    const space = unwrap<{ items: SpaceRecord[] } | SpaceRecord>(response.body);

    if ('items' in space) {
      throw new Error('Expected a single space record');
    }

    return space;
  };

  const createGroup = async (
    token: string,
    spaceId: string,
    input: {
      name: string;
      slug: string;
      description?: string | null;
    },
  ): Promise<GroupRecord> => {
    const response = await request(app.getHttpServer())
      .post(`/spaces/${spaceId}/groups`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
      })
      .expect(201);

    return unwrap<GroupRecord>(response.body);
  };

  const createEntity = async (
    token: string,
    spaceId: string,
    input: {
      title: string;
      summary?: string | null;
    },
  ): Promise<EntityRecord> => {
    const response = await request(app.getHttpServer())
      .post(`/spaces/${spaceId}/entities`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: input.title,
        summary: input.summary ?? null,
      })
      .expect(201);

    const entity = unwrap<EntityRecord>(response.body);
    entityRecordSchema.parse(entity);

    return entity;
  };

  const createGroupEntity = async (
    token: string,
    groupId: string,
    input: {
      title: string;
      summary?: string | null;
    },
  ): Promise<EntityRecord> => {
    const response = await request(app.getHttpServer())
      .post(`/groups/${groupId}/entities`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: input.title,
        summary: input.summary ?? null,
      })
      .expect(201);

    const entity = unwrap<EntityRecord>(response.body);
    entityRecordSchema.parse(entity);

    return entity;
  };

  const cleanDatabase = async () => {
    await pool.query(
      [
        'TRUNCATE TABLE',
        'group_canvas_states, groups, saved_views, document_entity_mentions, documents, space_canvas_states, relations, entities, entity_type_fields, entity_types, spaces, workspace_members, workspaces, users',
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
