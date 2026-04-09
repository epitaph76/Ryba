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
  spaceRecordSchema,
  workspaceRecordSchema,
} from '@ryba/schemas';
import type {
  ApiEnvelope,
  AuthSession,
  DocumentBacklinkRecord,
  DocumentDetailRecord,
  EntityRecord,
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

type DocumentBlockInput = {
  id: string;
  kind: 'paragraph' | 'heading' | 'list_item' | 'entity_reference';
  text: string | null;
  entityReferences: Array<Record<string, unknown>>;
};

describe('S-8A integration', () => {
  let app: NestFastifyApplication;
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-s8a-tests';
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

  it('resolves explicit root and group references while keeping bare keys local', async () => {
    const token = await bootstrapUserAndGetToken('s8a-qualified@ryba.local');
    const workspace = await createWorkspace(token, 'Cross-subspace refs', 'cross-subspace-refs');
    const space = await createSpace(token, workspace.id, 'Knowledge', 'knowledge');
    const deliveryGroup = await createGroup(token, space.id, {
      name: 'Delivery',
      slug: 'delivery',
    });
    const researchGroup = await createGroup(token, space.id, {
      name: 'Research',
      slug: 'research',
    });

    const rootEntity = await createEntity(token, space.id, {
      title: 'Root source',
      summary: 'Root definition owner',
    });
    const deliveryEntity = await createGroupEntity(token, deliveryGroup.id, {
      title: 'Delivery source',
      summary: 'Local group definition owner',
    });
    const researchEntity = await createGroupEntity(token, researchGroup.id, {
      title: 'Research source',
      summary: 'External group definition owner',
    });
    const consumerEntity = await createGroupEntity(token, deliveryGroup.id, {
      title: 'Delivery consumer',
      summary: 'Consumes local and explicit refs',
    });

    await upsertEntityDocument(token, rootEntity.id, {
      title: 'Root source',
      body: buildEntityDocumentBody(rootEntity.id, rootEntity.title, [
        {
          id: 'root-definition',
          kind: 'paragraph',
          text: 'shared_note**Root canonical**',
          entityReferences: [],
        },
      ]),
    });
    await upsertEntityDocument(token, deliveryEntity.id, {
      title: 'Delivery source',
      body: buildEntityDocumentBody(deliveryEntity.id, deliveryEntity.title, [
        {
          id: 'delivery-definition',
          kind: 'paragraph',
          text: 'shared_note**Delivery canonical**',
          entityReferences: [],
        },
      ]),
    });
    await upsertEntityDocument(token, researchEntity.id, {
      title: 'Research source',
      body: buildEntityDocumentBody(researchEntity.id, researchEntity.title, [
        {
          id: 'research-definition',
          kind: 'paragraph',
          text: 'shared_note**Research canonical**',
          entityReferences: [],
        },
      ]),
    });

    const consumerDocument = await upsertEntityDocument(token, consumerEntity.id, {
      title: 'Delivery consumer',
      body: buildEntityDocumentBody(consumerEntity.id, consumerEntity.title, [
        {
          id: 'usage-block',
          kind: 'paragraph',
          text: 'Use shared_note, root.shared_note and research.shared_note in one brief.',
          entityReferences: [],
        },
      ]),
    });

    expect(consumerDocument.mentions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'document_link_usage',
          entityId: deliveryEntity.id,
          linkKey: 'shared_note',
          definitionKey: 'shared_note',
          sourceGroupId: deliveryGroup.id,
          sourceGroupSlug: 'delivery',
        }),
        expect.objectContaining({
          kind: 'document_link_usage',
          entityId: rootEntity.id,
          linkKey: 'root.shared_note',
          definitionKey: 'shared_note',
          sourceGroupId: null,
          sourceGroupSlug: null,
        }),
        expect.objectContaining({
          kind: 'document_link_usage',
          entityId: researchEntity.id,
          linkKey: 'research.shared_note',
          definitionKey: 'shared_note',
          sourceGroupId: researchGroup.id,
          sourceGroupSlug: 'research',
        }),
      ]),
    );
    expect(consumerDocument.mentionedEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: deliveryEntity.id,
          title: 'Delivery source',
          groupId: deliveryGroup.id,
          groupSlug: 'delivery',
        }),
        expect.objectContaining({
          entityId: rootEntity.id,
          title: 'Root source',
          groupId: null,
          groupSlug: null,
        }),
        expect.objectContaining({
          entityId: researchEntity.id,
          title: 'Research source',
          groupId: researchGroup.id,
          groupSlug: 'research',
        }),
      ]),
    );

    const rootBacklinksResponse = await request(app.getHttpServer())
      .get(`/entities/${rootEntity.id}/document-backlinks`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const rootBacklinks = unwrap<{ items: DocumentBacklinkRecord[] }>(rootBacklinksResponse.body);
    listDocumentBacklinksResponseSchema.parse(rootBacklinks);
    expect(rootBacklinks.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceEntityId: consumerEntity.id,
          sourceGroupId: deliveryGroup.id,
          sourceGroupSlug: 'delivery',
        }),
      ]),
    );

    const researchBacklinksResponse = await request(app.getHttpServer())
      .get(`/entities/${researchEntity.id}/document-backlinks`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const researchBacklinks = unwrap<{ items: DocumentBacklinkRecord[] }>(
      researchBacklinksResponse.body,
    );
    listDocumentBacklinksResponseSchema.parse(researchBacklinks);
    expect(researchBacklinks.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceEntityId: consumerEntity.id,
          sourceGroupId: deliveryGroup.id,
          sourceGroupSlug: 'delivery',
        }),
      ]),
    );
  });

  it('rejects explicit qualified references that do not resolve inside the targeted group', async () => {
    const token = await bootstrapUserAndGetToken('s8a-invalid-qualified@ryba.local');
    const workspace = await createWorkspace(token, 'Qualified validation', 'qualified-validation');
    const space = await createSpace(token, workspace.id, 'Knowledge', 'knowledge');
    const deliveryGroup = await createGroup(token, space.id, {
      name: 'Delivery',
      slug: 'delivery',
    });
    await createGroup(token, space.id, {
      name: 'Research',
      slug: 'research',
    });
    const consumerEntity = await createGroupEntity(token, deliveryGroup.id, {
      title: 'Delivery consumer',
      summary: 'Should fail on missing qualified reference',
    });

    const response = await request(app.getHttpServer())
      .put(`/entities/${consumerEntity.id}/document`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Broken consumer',
        body: buildEntityDocumentBody(consumerEntity.id, consumerEntity.title, [
          {
            id: 'usage-block',
            kind: 'paragraph',
            text: 'Use research.shared_note before it exists.',
            entityReferences: [],
          },
        ]),
      })
      .expect(400);

    expect(response.body.ok).toBe(false);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toMatchObject({
      blockId: 'usage-block',
      linkKey: 'research.shared_note',
      scope: 'research',
    });
  });

  it('pushes sync edits back to the explicitly targeted source when bare keys collide', async () => {
    const token = await bootstrapUserAndGetToken('s8a-sync-qualified@ryba.local');
    const workspace = await createWorkspace(token, 'Sync cross-subspace refs', 'sync-cross-subspace');
    const space = await createSpace(token, workspace.id, 'Knowledge', 'knowledge');
    const deliveryGroup = await createGroup(token, space.id, {
      name: 'Delivery',
      slug: 'delivery',
    });

    const rootEntity = await createEntity(token, space.id, {
      title: 'Root live source',
      summary: 'Root sync definition',
    });
    const deliveryEntity = await createGroupEntity(token, deliveryGroup.id, {
      title: 'Delivery live source',
      summary: 'Local sync definition',
    });
    const consumerEntity = await createGroupEntity(token, deliveryGroup.id, {
      title: 'Delivery sync consumer',
      summary: 'Edits both refs',
    });

    await upsertEntityDocument(token, rootEntity.id, {
      title: 'Root live source',
      body: buildEntityDocumentBody(rootEntity.id, rootEntity.title, [
        {
          id: 'root-live',
          kind: 'paragraph',
          text: 'shared_live$$Root original$$',
          entityReferences: [],
        },
      ]),
    });
    await upsertEntityDocument(token, deliveryEntity.id, {
      title: 'Delivery live source',
      body: buildEntityDocumentBody(deliveryEntity.id, deliveryEntity.title, [
        {
          id: 'delivery-live',
          kind: 'paragraph',
          text: 'shared_live$$Delivery original$$',
          entityReferences: [],
        },
      ]),
    });

    const consumerDocument = await upsertEntityDocument(token, consumerEntity.id, {
      title: 'Delivery sync consumer',
      body: buildEntityDocumentBody(consumerEntity.id, consumerEntity.title, [
        {
          id: 'usage-block',
          kind: 'paragraph',
          text:
            'Edit root.shared_live$$Root edited remotely$$ and shared_live$$Delivery edited locally$$.',
          entityReferences: [],
        },
      ]),
    });

    expect(consumerDocument.mentions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'document_link_usage',
          entityId: rootEntity.id,
          linkKey: 'root.shared_live',
          linkMode: 'sync',
          sourceGroupId: null,
        }),
        expect.objectContaining({
          kind: 'document_link_usage',
          entityId: deliveryEntity.id,
          linkKey: 'shared_live',
          linkMode: 'sync',
          sourceGroupId: deliveryGroup.id,
          sourceGroupSlug: 'delivery',
        }),
      ]),
    );

    const refreshedRoot = await getEntityDocument(token, rootEntity.id);
    const refreshedDelivery = await getEntityDocument(token, deliveryEntity.id);

    expect(refreshedRoot.document.body[1]?.text).toBe('shared_live$$Root edited remotely$$');
    expect(refreshedDelivery.document.body[1]?.text).toBe(
      'shared_live$$Delivery edited locally$$',
    );
  });

  const bootstrapUserAndGetToken = async (email: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'Password123',
        displayName: 'S8A Tester',
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

  const getEntityDocument = async (
    token: string,
    entityId: string,
  ): Promise<DocumentDetailRecord> => {
    const response = await request(app.getHttpServer())
      .get(`/entities/${entityId}/document`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const document = unwrap<DocumentDetailRecord>(response.body);
    documentDetailRecordSchema.parse(document);

    return document;
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

  const cleanDatabase = async () => {
    await pool.query(
      [
        'TRUNCATE TABLE',
        'activity_events, group_canvas_states, groups, saved_views, document_entity_mentions, documents, space_canvas_states, relations, entities, entity_type_fields, entity_types, spaces, workspace_members, workspaces, users',
        'RESTART IDENTITY CASCADE',
      ].join(' '),
    );
  };
});

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
