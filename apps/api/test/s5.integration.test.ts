import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { Pool } from 'pg';
import {
  authSessionSchema,
  documentDetailRecordSchema,
  entityRecordSchema,
  listDocumentBacklinksResponseSchema,
  listDocumentsResponseSchema,
  listEntityTypesResponseSchema,
  spaceRecordSchema,
  workspaceRecordSchema,
} from '@ryba/schemas';
import type {
  ApiEnvelope,
  AuthSession,
  DocumentBacklinkRecord,
  DocumentDetailRecord,
  DocumentRecord,
  EntityRecord,
  EntityTypeRecord,
  SpaceRecord,
  WorkspaceRecord,
} from '@ryba/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ryba';

describe('S-5 integration', () => {
  let app: NestFastifyApplication;
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-s5-tests';
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

  it('creates documents with entity mentions and exposes backlinks', async () => {
    const token = await bootstrapUserAndGetToken('s5-docs@ryba.local');
    const workspace = await createWorkspace(token, 'Docs Workspace', 'docs-workspace');
    const space = await createSpace(token, workspace.id, 'Knowledge', 'knowledge');
    const taskType = await getEntityTypeBySlug(token, workspace.id, 'task');

    const entity = await createEntity(token, space.id, {
      entityTypeId: taskType.id,
      title: 'Ship S5',
      summary: 'Narrative context target',
      properties: {
        status: 'todo',
      },
    });

    const createResponse = await request(app.getHttpServer())
      .post(`/spaces/${space.id}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'S5 design note',
        body: [
          {
            id: 'block-1',
            kind: 'heading',
            text: 'S5 design note',
            entityReferences: [],
          },
          {
            id: 'block-2',
            kind: 'paragraph',
            text: `Need to connect [[entity:${entity.id}]] to the narrative layer.`,
            entityReferences: [
              {
                entityId: entity.id,
                label: entity.title,
                anchorId: 'mention-task',
              },
            ],
          },
        ],
      })
      .expect(201);

    const createdDetail = unwrap<DocumentDetailRecord>(createResponse.body);
    documentDetailRecordSchema.parse(createdDetail);
    expect(createdDetail.document.title).toBe('S5 design note');
    expect(createdDetail.document.previewText).toContain('S5 design note');
    expect(createdDetail.mentionedEntities).toEqual([
      expect.objectContaining({
        entityId: entity.id,
        title: entity.title,
      }),
    ]);

    const listResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const list = unwrap<{ items: DocumentRecord[] }>(listResponse.body);
    listDocumentsResponseSchema.parse(list);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.id).toBe(createdDetail.document.id);

    const updateResponse = await request(app.getHttpServer())
      .patch(`/documents/${createdDetail.document.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        body: [
          {
            id: 'block-1',
            kind: 'heading',
            text: 'S5 design note',
            entityReferences: [],
          },
          {
            id: 'block-3',
            kind: 'paragraph',
            text: `The document keeps [[entity:${entity.id}]] as a live mention.`,
            entityReferences: [
              {
                entityId: entity.id,
                label: 'Ship S5',
                anchorId: 'mention-task',
              },
            ],
          },
        ],
      })
      .expect(200);

    const updatedDetail = unwrap<DocumentDetailRecord>(updateResponse.body);
    documentDetailRecordSchema.parse(updatedDetail);
    expect(updatedDetail.document.previewText).toContain('live mention');

    const backlinksResponse = await request(app.getHttpServer())
      .get(`/entities/${entity.id}/document-backlinks`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const backlinks = unwrap<{ items: DocumentBacklinkRecord[] }>(backlinksResponse.body);
    listDocumentBacklinksResponseSchema.parse(backlinks);
    expect(backlinks.items).toEqual([
      expect.objectContaining({
        entityId: entity.id,
        documentId: createdDetail.document.id,
        documentTitle: 'S5 design note',
      }),
    ]);
  });

  it('rejects mentions that point to entities from another space', async () => {
    const token = await bootstrapUserAndGetToken('s5-invalid@ryba.local');
    const workspace = await createWorkspace(token, 'Validation Workspace', 'validation-workspace');
    const sourceSpace = await createSpace(token, workspace.id, 'Source', 'source');
    const otherSpace = await createSpace(token, workspace.id, 'Other', 'other');

    const entity = await createEntity(token, otherSpace.id, {
      title: 'Off-context entity',
      summary: 'Lives in another space',
    });

    const response = await request(app.getHttpServer())
      .post(`/spaces/${sourceSpace.id}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Broken note',
        body: [
          {
            id: 'block-1',
            kind: 'paragraph',
            text: `[[entity:${entity.id}]]`,
            entityReferences: [
              {
                entityId: entity.id,
                label: entity.title,
                anchorId: null,
              },
            ],
          },
        ],
      })
      .expect(400);

    expect(response.body.ok).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('blocks cross-workspace access to documents and backlinks', async () => {
    const tokenOne = await bootstrapUserAndGetToken('s5-first@ryba.local');
    const tokenTwo = await bootstrapUserAndGetToken('s5-second@ryba.local');
    const workspace = await createWorkspace(tokenTwo, 'Private Docs', 'private-docs');
    const space = await createSpace(tokenTwo, workspace.id, 'Ops', 'ops');
    const entity = await createEntity(tokenTwo, space.id, {
      title: 'Private entity',
    });

    const document = unwrap<DocumentDetailRecord>(
      (
        await request(app.getHttpServer())
          .post(`/spaces/${space.id}/documents`)
          .set('Authorization', `Bearer ${tokenTwo}`)
          .send({
            title: 'Private note',
            body: [],
          })
          .expect(201)
      ).body,
    );

    const documentResponse = await request(app.getHttpServer())
      .get(`/documents/${document.document.id}`)
      .set('Authorization', `Bearer ${tokenOne}`)
      .expect(403);

    expect(documentResponse.body.ok).toBe(false);
    expect(documentResponse.body.error.code).toBe('FORBIDDEN');

    const backlinksResponse = await request(app.getHttpServer())
      .get(`/entities/${entity.id}/document-backlinks`)
      .set('Authorization', `Bearer ${tokenOne}`)
      .expect(403);

    expect(backlinksResponse.body.ok).toBe(false);
    expect(backlinksResponse.body.error.code).toBe('FORBIDDEN');
  });

  const bootstrapUserAndGetToken = async (email: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'Password123',
        displayName: 'Documents Tester',
      })
      .expect(201);

    const session = unwrap<AuthSession>(response.body);
    authSessionSchema.parse(session);

    return session.accessToken;
  };

  const createWorkspace = async (token: string, name: string, slug: string): Promise<WorkspaceRecord> => {
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
        'document_entity_mentions, documents, space_canvas_states, relations, entities, entity_type_fields, entity_types, spaces, workspace_members, workspaces, users',
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
