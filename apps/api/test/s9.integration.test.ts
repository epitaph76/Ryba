import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { Pool } from 'pg';
import {
  authSessionSchema,
  documentCollaborationSessionRecordSchema,
  documentDetailRecordSchema,
  entityRecordSchema,
  spaceRecordSchema,
  workspaceRecordSchema,
} from '@ryba/schemas';
import type {
  ApiEnvelope,
  AuthSession,
  DocumentCollaborationSessionRecord,
  DocumentDetailRecord,
  EntityRecord,
  SpaceRecord,
  WorkspaceMemberDetailRecord,
  WorkspaceRecord,
} from '@ryba/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ryba';

describe('S-9 integration', () => {
  let app: NestFastifyApplication;
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-s9-tests';
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

  it('returns collaboration bootstrap access for owner, editor and viewer roles', async () => {
    const ownerToken = await bootstrapUserAndGetToken('s9-owner@ryba.local');
    const editorToken = await bootstrapUserAndGetToken('s9-editor@ryba.local');
    const viewerToken = await bootstrapUserAndGetToken('s9-viewer@ryba.local');

    const workspace = await createWorkspace(ownerToken, 'Collaboration Workspace', 'collab-workspace');
    const space = await createSpace(ownerToken, workspace.id, 'Knowledge', 'knowledge');
    await inviteMember(ownerToken, workspace.id, 's9-editor@ryba.local', 'editor');
    await inviteMember(ownerToken, workspace.id, 's9-viewer@ryba.local', 'viewer');

    const entity = await createEntity(ownerToken, space.id, {
      title: 'Shared note',
      summary: 'Realtime target',
    });
    const document = await upsertEntityDocument(ownerToken, entity.id, {
      title: 'Shared note',
      body: [
        {
          id: 'block-1',
          kind: 'paragraph',
          text: 'Realtime collaboration seed.',
          entityReferences: [],
        },
      ],
    });

    const ownerSession = await getCollaborationSession(ownerToken, document.document.id);
    const editorSession = await getCollaborationSession(editorToken, document.document.id);
    const viewerSession = await getCollaborationSession(viewerToken, document.document.id);

    expect(ownerSession).toEqual({
      documentId: document.document.id,
      canEdit: true,
    });
    expect(editorSession).toEqual({
      documentId: document.document.id,
      canEdit: true,
    });
    expect(viewerSession).toEqual({
      documentId: document.document.id,
      canEdit: false,
    });
  });

  it('rejects collaboration bootstrap for users outside the workspace', async () => {
    const ownerToken = await bootstrapUserAndGetToken('s9-locked-owner@ryba.local');
    const outsiderToken = await bootstrapUserAndGetToken('s9-outsider@ryba.local');

    const workspace = await createWorkspace(ownerToken, 'Private Workspace', 'private-workspace');
    const space = await createSpace(ownerToken, workspace.id, 'Private Docs', 'private-docs');
    const entity = await createEntity(ownerToken, space.id, {
      title: 'Private doc',
      summary: 'Should stay private',
    });
    const document = await upsertEntityDocument(ownerToken, entity.id, {
      title: 'Private doc',
      body: [
        {
          id: 'block-1',
          kind: 'paragraph',
          text: 'No access.',
          entityReferences: [],
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get(`/documents/${document.document.id}/collaboration`)
      .set('Authorization', `Bearer ${outsiderToken}`)
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
        displayName: 'Collaboration Tester',
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
        properties: {},
      })
      .expect(201);

    const entity = unwrap<EntityRecord>(response.body);
    entityRecordSchema.parse(entity);

    return entity;
  };

  const upsertEntityDocument = async (
    token: string,
    entityId: string,
    input: {
      title: string;
      body: Array<{
        id: string;
        kind: 'paragraph' | 'heading' | 'list_item' | 'entity_reference';
        text: string | null;
        entityReferences: Array<Record<string, unknown>>;
      }>;
    },
  ): Promise<DocumentDetailRecord> => {
    const response = await request(app.getHttpServer())
      .put(`/entities/${entityId}/document`)
      .set('Authorization', `Bearer ${token}`)
      .send(input)
      .expect(200);

    const detail = unwrap<DocumentDetailRecord>(response.body);
    documentDetailRecordSchema.parse(detail);

    return detail;
  };

  const getCollaborationSession = async (
    token: string,
    documentId: string,
  ): Promise<DocumentCollaborationSessionRecord> => {
    const response = await request(app.getHttpServer())
      .get(`/documents/${documentId}/collaboration`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const session = unwrap<DocumentCollaborationSessionRecord>(response.body);
    documentCollaborationSessionRecordSchema.parse(session);

    return session;
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

const unwrap = <TData>(envelope: ApiEnvelope<TData>): TData => {
  if (!envelope.ok) {
    throw new Error(`${envelope.error.code}: ${envelope.error.message}`);
  }

  return envelope.data;
};
