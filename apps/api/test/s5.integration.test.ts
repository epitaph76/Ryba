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
  listRelationsResponseSchema,
  loginRequestSchema,
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
  RelationRecord,
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

  it('binds documents to entity nodes and syncs relations from mentions', async () => {
    const token = await bootstrapUserAndGetToken('s5-docs@ryba.local');
    const workspace = await createWorkspace(token, 'Docs Workspace', 'docs-workspace');
    const space = await createSpace(token, workspace.id, 'Knowledge', 'knowledge');
    const taskType = await getEntityTypeBySlug(token, workspace.id, 'task');

    const targetEntity = await createEntity(token, space.id, {
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
            kind: 'paragraph',
            text: `Need to connect [[entity:${targetEntity.id}|${targetEntity.title}]] to the narrative layer.`,
            entityReferences: [
              {
                entityId: targetEntity.id,
                label: targetEntity.title,
                anchorId: 'mention-task',
              },
            ],
          },
        ],
      })
      .expect(201);

    const createdDetail = unwrap<DocumentDetailRecord>(createResponse.body);
    documentDetailRecordSchema.parse(createdDetail);
    expect(createdDetail.document.entityId).toBe(createdDetail.entity.id);
    expect(createdDetail.entity.title).toBe('S5 design note');
    expect(createdDetail.mentionedEntities).toEqual([
      expect.objectContaining({
        entityId: targetEntity.id,
        title: targetEntity.title,
      }),
    ]);

    const entityDocumentResponse = await request(app.getHttpServer())
      .get(`/entities/${createdDetail.entity.id}/document`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const entityDocument = unwrap<DocumentDetailRecord>(entityDocumentResponse.body);
    documentDetailRecordSchema.parse(entityDocument);
    expect(entityDocument.document.id).toBe(createdDetail.document.id);

    const relationsResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/relations`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const relationsList = unwrap<{ items: RelationRecord[] }>(relationsResponse.body);
    listRelationsResponseSchema.parse(relationsList);
    expect(relationsList.items).toEqual([
      expect.objectContaining({
        fromEntityId: createdDetail.entity.id,
        toEntityId: targetEntity.id,
        relationType: 'document_link',
      }),
    ]);

    const updateResponse = await request(app.getHttpServer())
      .put(`/entities/${createdDetail.entity.id}/document`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'S5 design note updated',
        body: [
          {
            id: 'block-2',
            kind: 'paragraph',
            text: 'The mention was removed from the document.',
            entityReferences: [],
          },
        ],
      })
      .expect(200);

    const updatedDetail = unwrap<DocumentDetailRecord>(updateResponse.body);
    documentDetailRecordSchema.parse(updatedDetail);
    expect(updatedDetail.entity.title).toBe('S5 design note updated');

    const relationsAfterUpdateResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/relations`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const relationsAfterUpdate = unwrap<{ items: RelationRecord[] }>(relationsAfterUpdateResponse.body);
    listRelationsResponseSchema.parse(relationsAfterUpdate);
    expect(relationsAfterUpdate.items).toEqual([]);

    const backlinksResponse = await request(app.getHttpServer())
      .get(`/entities/${targetEntity.id}/document-backlinks`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const backlinks = unwrap<{ items: DocumentBacklinkRecord[] }>(backlinksResponse.body);
    listDocumentBacklinksResponseSchema.parse(backlinks);
    expect(backlinks.items).toEqual([]);
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

  it('supports repeat registration UX via conflict details and stable login', async () => {
    const registerBody = {
      email: 's5-login@ryba.local',
      password: 'Password123',
      displayName: 'Documents Tester',
    };

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send(registerBody)
      .expect(201);

    const session = unwrap<AuthSession>(registerResponse.body);
    authSessionSchema.parse(session);

    const conflictResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send(registerBody)
      .expect(409);

    expect(conflictResponse.body.ok).toBe(false);
    expect(conflictResponse.body.error.code).toBe('CONFLICT');
    expect(conflictResponse.body.error.details).toMatchObject({
      email: 's5-login@ryba.local',
      canLogin: true,
    });

    const loginBody = {
      email: registerBody.email,
      password: registerBody.password,
    };
    loginRequestSchema.parse(loginBody);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send(loginBody)
      .expect(201);

    const loggedIn = unwrap<AuthSession>(loginResponse.body);
    authSessionSchema.parse(loggedIn);
    expect(loggedIn.user.email).toBe(registerBody.email);
  });

  it('creates graph relations from static document links and keeps copied text immutable', async () => {
    const token = await bootstrapUserAndGetToken('s5-static-links@ryba.local');
    const workspace = await createWorkspace(token, 'Static Links', 'static-links');
    const space = await createSpace(token, workspace.id, 'Knowledge', 'knowledge');

    const sourceEntity = await createEntity(token, space.id, {
      title: 'Source note',
      summary: 'Definition holder',
    });
    const consumerEntity = await createEntity(token, space.id, {
      title: 'Consumer note',
      summary: 'Uses static copy',
    });

    const sourceDocument = await upsertEntityDocument(token, sourceEntity.id, {
      title: 'Source note',
      body: buildEntityDocumentBody(sourceEntity.id, sourceEntity.title, [
        {
          id: 'definition-block',
          kind: 'paragraph',
          text: 'shared_note**Canonical text**',
          entityReferences: [],
        },
      ]),
    });

    const consumerDocument = await upsertEntityDocument(token, consumerEntity.id, {
      title: 'Consumer note',
      body: buildEntityDocumentBody(consumerEntity.id, consumerEntity.title, [
        {
          id: 'usage-block',
          kind: 'paragraph',
          text: 'Use shared_note in the brief.',
          entityReferences: [],
        },
      ]),
    });

    expect(consumerDocument.document.body[1]?.text).toBe('Use shared_note in the brief.');
    expect(consumerDocument.mentions).toContainEqual(
      expect.objectContaining({
        entityId: sourceEntity.id,
        kind: 'document_link_usage',
        linkKey: 'shared_note',
      }),
    );

    const relationsResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/relations`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const relationsList = unwrap<{ items: RelationRecord[] }>(relationsResponse.body);
    listRelationsResponseSchema.parse(relationsList);
    expect(relationsList.items).toHaveLength(1);
    expect(relationsList.items).toContainEqual(
      expect.objectContaining({
        fromEntityId: sourceEntity.id,
        toEntityId: consumerEntity.id,
        relationType: 'document_link',
      }),
    );

    const backlinksResponse = await request(app.getHttpServer())
      .get(`/entities/${sourceEntity.id}/document-backlinks`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const backlinks = unwrap<{ items: DocumentBacklinkRecord[] }>(backlinksResponse.body);
    listDocumentBacklinksResponseSchema.parse(backlinks);
    expect(backlinks.items).toContainEqual(
      expect.objectContaining({
        sourceEntityId: consumerEntity.id,
        documentId: consumerDocument.document.id,
      }),
    );
  });

  it('creates usage references and relations when a consumer saves only a bare link key', async () => {
    const token = await bootstrapUserAndGetToken('s5-bare-links@ryba.local');
    const workspace = await createWorkspace(token, 'Bare Links', 'bare-links');
    const space = await createSpace(token, workspace.id, 'Knowledge', 'knowledge');

    const sourceEntity = await createEntity(token, space.id, {
      title: 'Source bare note',
      summary: 'Definition holder',
    });
    const consumerEntity = await createEntity(token, space.id, {
      title: 'Consumer bare note',
      summary: 'Uses bare key',
    });

    await upsertEntityDocument(token, sourceEntity.id, {
      title: 'Source bare note',
      body: buildEntityDocumentBody(sourceEntity.id, sourceEntity.title, [
        {
          id: 'definition-block',
          kind: 'paragraph',
          text: 'shared_bare**Canonical text**',
          entityReferences: [
            {
              entityId: sourceEntity.id,
              label: 'shared_bare',
              anchorId: 'definition-block',
              kind: 'document_link_definition',
              linkKey: 'shared_bare',
              linkText: 'Canonical text',
              linkMode: 'static',
              sourceDocumentId: null,
              sourceBlockId: 'definition-block',
            },
          ],
        },
      ]),
    });

    const consumerDocument = await upsertEntityDocument(token, consumerEntity.id, {
      title: 'Consumer bare note',
      body: buildEntityDocumentBody(consumerEntity.id, consumerEntity.title, [
        {
          id: 'usage-block',
          kind: 'paragraph',
          text: 'Use shared_bare in the brief.',
          entityReferences: [],
        },
      ]),
    });

    expect(consumerDocument.document.body[1]?.text).toBe('Use shared_bare in the brief.');
    expect(consumerDocument.document.body[1]?.entityReferences).toContainEqual(
      expect.objectContaining({
        entityId: sourceEntity.id,
        kind: 'document_link_usage',
        linkKey: 'shared_bare',
        linkMode: 'static',
        sourceBlockId: 'definition-block',
      }),
    );

    const relationsResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/relations`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const relationsList = unwrap<{ items: RelationRecord[] }>(relationsResponse.body);
    listRelationsResponseSchema.parse(relationsList);
    expect(relationsList.items).toHaveLength(1);
    expect(relationsList.items).toContainEqual(
      expect.objectContaining({
        fromEntityId: sourceEntity.id,
        toEntityId: consumerEntity.id,
        relationType: 'document_link',
      }),
    );
  });

  it('pushes sync document-link edits back into the source document', async () => {
    const token = await bootstrapUserAndGetToken('s5-sync-links@ryba.local');
    const workspace = await createWorkspace(token, 'Sync Links', 'sync-links');
    const space = await createSpace(token, workspace.id, 'Knowledge', 'knowledge');

    const sourceEntity = await createEntity(token, space.id, {
      title: 'Live source',
      summary: 'Sync definition holder',
    });
    const consumerEntity = await createEntity(token, space.id, {
      title: 'Live consumer',
      summary: 'Edits synced copy',
    });

    const sourceDocument = await upsertEntityDocument(token, sourceEntity.id, {
      title: 'Live source',
      body: buildEntityDocumentBody(sourceEntity.id, sourceEntity.title, [
        {
          id: 'sync-definition',
          kind: 'paragraph',
          text: 'shared_live$$Original text$$',
          entityReferences: [],
        },
      ]),
    });

    const consumerDocument = await upsertEntityDocument(token, consumerEntity.id, {
      title: 'Live consumer',
      body: buildEntityDocumentBody(consumerEntity.id, consumerEntity.title, [
        {
          id: 'sync-usage',
          kind: 'paragraph',
          text: 'Reference shared_live$$Edited remotely$$ here.',
          entityReferences: [],
        },
      ]),
    });

    expect(consumerDocument.mentions).toContainEqual(
      expect.objectContaining({
        entityId: sourceEntity.id,
        kind: 'document_link_usage',
        linkKey: 'shared_live',
        linkMode: 'sync',
      }),
    );

    const relationsResponse = await request(app.getHttpServer())
      .get(`/spaces/${space.id}/relations`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const relationsList = unwrap<{ items: RelationRecord[] }>(relationsResponse.body);
    listRelationsResponseSchema.parse(relationsList);
    expect(relationsList.items).toContainEqual(
      expect.objectContaining({
        fromEntityId: sourceEntity.id,
        toEntityId: consumerEntity.id,
        relationType: 'document_link',
        properties: expect.objectContaining({
          linkMode: 'sync',
        }),
      }),
    );

    const refreshedSourceResponse = await request(app.getHttpServer())
      .get(`/entities/${sourceEntity.id}/document`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const refreshedSource = unwrap<DocumentDetailRecord>(refreshedSourceResponse.body);
    documentDetailRecordSchema.parse(refreshedSource);
    expect(refreshedSource.document.body[1]?.text).toBe('shared_live$$Edited remotely$$');
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

  const upsertEntityDocument = async (
    token: string,
    entityId: string,
    input: {
      title: string;
      body: DocumentBlockInput[];
    },
  ): Promise<DocumentDetailRecord> => {
    const response = await request(app.getHttpServer())
      .put(`/entities/${entityId}/document`)
      .set('Authorization', `Bearer ${token}`)
      .send(input)
      .expect(200);

    const document = unwrap<DocumentDetailRecord>(response.body);
    documentDetailRecordSchema.parse(document);

    return document;
  };
});

type DocumentBlockInput = {
  id: string;
  kind: 'paragraph' | 'heading' | 'list_item' | 'entity_reference';
  text: string | null;
  entityReferences: Array<Record<string, unknown>>;
};

const buildEntityDocumentBody = (
  entityId: string,
  entityTitle: string,
  blocks: DocumentBlockInput[],
): DocumentBlockInput[] => [
  {
    id: 'entity-document-root-block',
    kind: 'entity_reference',
    text: null,
    entityReferences: [
      {
        entityId,
        label: entityTitle,
        anchorId: 'entity-document-root',
      },
    ],
  },
  ...blocks,
];

const unwrap = <TData>(envelope: ApiEnvelope<TData>): TData => {
  if (!envelope.ok) {
    throw new Error(`${envelope.error.code}: ${envelope.error.message}`);
  }

  return envelope.data;
};
