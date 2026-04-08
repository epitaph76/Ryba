import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { Pool } from 'pg';
import {
  authSessionSchema,
  entityRecordSchema,
  listActivityEventsResponseSchema,
  listWorkspaceMembersResponseSchema,
  spaceRecordSchema,
  workspaceRecordSchema,
} from '@ryba/schemas';
import type {
  ActivityEventRecord,
  ApiEnvelope,
  AuthSession,
  EntityRecord,
  SpaceRecord,
  WorkspaceMemberDetailRecord,
  WorkspaceRecord,
} from '@ryba/types';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ryba';

describe('S-8 integration', () => {
  let app: NestFastifyApplication;
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-s8-tests';
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

  it('lets owners manage workspace membership and writes activity events', async () => {
    const ownerToken = await bootstrapUserAndGetToken('s8-owner@ryba.local');
    await bootstrapUserAndGetToken('s8-editor@ryba.local');
    await bootstrapUserAndGetToken('s8-viewer@ryba.local');

    const workspace = await createWorkspace(ownerToken, 'Permissions Workspace', 'permissions-workspace');
    const invitedEditor = await inviteMember(ownerToken, workspace.id, 's8-editor@ryba.local', 'editor');
    const invitedViewer = await inviteMember(ownerToken, workspace.id, 's8-viewer@ryba.local', 'viewer');

    const membersResponse = await request(app.getHttpServer())
      .get(`/workspaces/${workspace.id}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const members = unwrap<{ items: WorkspaceMemberDetailRecord[] }>(membersResponse.body);
    listWorkspaceMembersResponseSchema.parse(members);
    expect(
      Object.fromEntries(members.items.map((member) => [member.user.email, member.role])),
    ).toMatchObject({
      's8-owner@ryba.local': 'owner',
      's8-editor@ryba.local': 'editor',
      's8-viewer@ryba.local': 'viewer',
    });

    expect(invitedEditor.role).toBe('editor');
    expect(invitedViewer.role).toBe('viewer');

    const updateRoleResponse = await request(app.getHttpServer())
      .patch(`/workspaces/members/${invitedViewer.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        role: 'editor',
      })
      .expect(200);

    const updatedViewer = unwrap<WorkspaceMemberDetailRecord>(updateRoleResponse.body);
    expect(updatedViewer.role).toBe('editor');

    const activityResponse = await request(app.getHttpServer())
      .get(`/workspaces/${workspace.id}/activity`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const activity = unwrap<{ items: ActivityEventRecord[] }>(activityResponse.body);
    listActivityEventsResponseSchema.parse(activity);
    expect(activity.items.map((item) => item.eventType)).toEqual(
      expect.arrayContaining(['workspace.member_added', 'workspace.member_role_changed']),
    );
    expect(activity.items[0]?.summary).toContain('Role updated');
  });

  it('keeps viewers in read only mode while still exposing members and activity', async () => {
    const ownerToken = await bootstrapUserAndGetToken('s8-read-owner@ryba.local');
    const viewerToken = await bootstrapUserAndGetToken('s8-read-viewer@ryba.local');

    const workspace = await createWorkspace(ownerToken, 'Viewer Workspace', 'viewer-workspace');
    const space = await createSpace(ownerToken, workspace.id, 'Read Only', 'read-only');
    await inviteMember(ownerToken, workspace.id, 's8-read-viewer@ryba.local', 'viewer');

    const membersResponse = await request(app.getHttpServer())
      .get(`/workspaces/${workspace.id}/members`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);

    const members = unwrap<{ items: WorkspaceMemberDetailRecord[] }>(membersResponse.body);
    listWorkspaceMembersResponseSchema.parse(members);
    expect(members.items).toHaveLength(2);

    const activityResponse = await request(app.getHttpServer())
      .get(`/workspaces/${workspace.id}/activity`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);

    const activity = unwrap<{ items: ActivityEventRecord[] }>(activityResponse.body);
    listActivityEventsResponseSchema.parse(activity);
    expect(activity.items.map((item) => item.eventType)).toContain('space.created');

    const createEntityResponse = await request(app.getHttpServer())
      .post(`/spaces/${space.id}/entities`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        title: 'Viewer should not create this',
        summary: 'read only',
        properties: {},
      })
      .expect(403);

    expect(createEntityResponse.body.ok).toBe(false);
    expect(createEntityResponse.body.error.code).toBe('FORBIDDEN');
  });

  it('lets editors change content but blocks workspace management', async () => {
    const ownerToken = await bootstrapUserAndGetToken('s8-edit-owner@ryba.local');
    const editorToken = await bootstrapUserAndGetToken('s8-edit-editor@ryba.local');

    const workspace = await createWorkspace(ownerToken, 'Editor Workspace', 'editor-workspace');
    const space = await createSpace(ownerToken, workspace.id, 'Editable', 'editable');
    await inviteMember(ownerToken, workspace.id, 's8-edit-editor@ryba.local', 'editor');

    const createEntityResponse = await request(app.getHttpServer())
      .post(`/spaces/${space.id}/entities`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        title: 'Editor-created entity',
        summary: 'Content is editable',
        properties: {},
      })
      .expect(201);

    const createdEntity = unwrap<EntityRecord>(createEntityResponse.body);
    entityRecordSchema.parse(createdEntity);

    const createSpaceResponse = await request(app.getHttpServer())
      .post(`/workspaces/${workspace.id}/spaces`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        name: 'Should fail',
        slug: 'should-fail',
      })
      .expect(403);

    expect(createSpaceResponse.body.ok).toBe(false);
    expect(createSpaceResponse.body.error.code).toBe('FORBIDDEN');

    const activityResponse = await request(app.getHttpServer())
      .get(`/workspaces/${workspace.id}/activity`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const activity = unwrap<{ items: ActivityEventRecord[] }>(activityResponse.body);
    listActivityEventsResponseSchema.parse(activity);
    expect(
      activity.items.some(
        (item) =>
          item.eventType === 'entity.created' &&
          item.actor.email === 's8-edit-editor@ryba.local' &&
          item.targetId === createdEntity.id,
      ),
    ).toBe(true);
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
