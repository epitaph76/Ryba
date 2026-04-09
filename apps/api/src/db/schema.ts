import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_unique').on(table.email),
  }),
);

export const workspaces = pgTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex('workspaces_slug_unique').on(table.slug),
  }),
);

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workspaceUserUnique: unique('workspace_members_workspace_user_unique').on(
      table.workspaceId,
      table.userId,
    ),
    workspaceIdx: index('workspace_members_workspace_idx').on(table.workspaceId),
    userIdx: index('workspace_members_user_idx').on(table.userId),
  }),
);

export const spaces = pgTable(
  'spaces',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workspaceSlugUnique: unique('spaces_workspace_slug_unique').on(table.workspaceId, table.slug),
    workspaceIdx: index('spaces_workspace_idx').on(table.workspaceId),
  }),
);

export const groups = pgTable(
  'groups',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    spaceSlugUnique: unique('groups_space_slug_unique').on(table.spaceId, table.slug),
    workspaceIdx: index('groups_workspace_idx').on(table.workspaceId),
    spaceIdx: index('groups_space_idx').on(table.spaceId),
  }),
);

export const activityEvents = pgTable(
  'activity_events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    spaceId: text('space_id').references(() => spaces.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    eventType: text('event_type').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    summary: text('summary').notNull(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workspaceIdx: index('activity_events_workspace_idx').on(table.workspaceId),
    spaceIdx: index('activity_events_space_idx').on(table.spaceId),
    groupIdx: index('activity_events_group_idx').on(table.groupId),
    actorIdx: index('activity_events_actor_idx').on(table.actorUserId),
    createdAtIdx: index('activity_events_created_at_idx').on(table.createdAt),
  }),
);

export const spaceCanvasStates = pgTable(
  'space_canvas_states',
  {
    spaceId: text('space_id')
      .primaryKey()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    layout: jsonb('layout')
      .notNull()
      .default(
        sql`'{"viewport":{"zoom":1,"offset":{"x":0,"y":0}},"nodes":[],"edges":[]}'::jsonb`,
      ),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updatedByUserId: text('updated_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const groupCanvasStates = pgTable('group_canvas_states', {
  groupId: text('group_id')
    .primaryKey()
    .references(() => groups.id, { onDelete: 'cascade' }),
  layout: jsonb('layout')
    .notNull()
    .default(
      sql`'{"viewport":{"zoom":1,"offset":{"x":0,"y":0}},"nodes":[],"edges":[]}'::jsonb`,
    ),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  updatedByUserId: text('updated_by_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const entityTypes = pgTable(
  'entity_types',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    color: text('color'),
    icon: text('icon'),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workspaceSlugUnique: unique('entity_types_workspace_slug_unique').on(table.workspaceId, table.slug),
    workspaceIdx: index('entity_types_workspace_idx').on(table.workspaceId),
  }),
);

export const entityTypeFields = pgTable(
  'entity_type_fields',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    entityTypeId: text('entity_type_id')
      .notNull()
      .references(() => entityTypes.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    fieldType: text('field_type').notNull(),
    description: text('description'),
    required: boolean('required').notNull().default(false),
    order: integer('order').notNull().default(0),
    config: jsonb('config').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    entityTypeKeyUnique: unique('entity_type_fields_entity_type_key_unique').on(
      table.entityTypeId,
      table.key,
    ),
    entityTypeOrderUnique: unique('entity_type_fields_entity_type_order_unique').on(
      table.entityTypeId,
      table.order,
    ),
    workspaceIdx: index('entity_type_fields_workspace_idx').on(table.workspaceId),
    entityTypeIdx: index('entity_type_fields_entity_type_idx').on(table.entityTypeId),
  }),
);

export const entities = pgTable(
  'entities',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    entityTypeId: text('entity_type_id').references(() => entityTypes.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    summary: text('summary'),
    properties: jsonb('properties').notNull().default(sql`'{}'::jsonb`),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updatedByUserId: text('updated_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workspaceIdx: index('entities_workspace_idx').on(table.workspaceId),
    spaceIdx: index('entities_space_idx').on(table.spaceId),
    groupIdx: index('entities_group_idx').on(table.groupId),
    entityTypeIdx: index('entities_entity_type_idx').on(table.entityTypeId),
  }),
);

export const documents = pgTable(
  'documents',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    entityId: text('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: jsonb('body').notNull().default(sql`'[]'::jsonb`),
    previewText: text('preview_text').notNull().default(''),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updatedByUserId: text('updated_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workspaceIdx: index('documents_workspace_idx').on(table.workspaceId),
    spaceIdx: index('documents_space_idx').on(table.spaceId),
    groupIdx: index('documents_group_idx').on(table.groupId),
    entityUnique: unique('documents_entity_unique').on(table.entityId),
    entityIdx: index('documents_entity_idx').on(table.entityId),
  }),
);

export const savedViews = pgTable(
  'saved_views',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    entityTypeId: text('entity_type_id').references(() => entityTypes.id, { onDelete: 'set null' }),
    viewType: text('view_type').notNull(),
    config: jsonb('config')
      .notNull()
      .default(sql`'{"filters":[],"sort":[],"columns":[]}'::jsonb`),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updatedByUserId: text('updated_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workspaceIdx: index('saved_views_workspace_idx').on(table.workspaceId),
    spaceIdx: index('saved_views_space_idx').on(table.spaceId),
    groupIdx: index('saved_views_group_idx').on(table.groupId),
    entityTypeIdx: index('saved_views_entity_type_idx').on(table.entityTypeId),
  }),
);

export const dataSources = pgTable(
  'data_sources',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    connectionConfig: jsonb('connection_config').notNull().default(sql`'{}'::jsonb`),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updatedByUserId: text('updated_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workspaceIdx: index('data_sources_workspace_idx').on(table.workspaceId),
    workspaceNameUnique: unique('data_sources_workspace_name_unique').on(
      table.workspaceId,
      table.name,
    ),
  }),
);

export const savedQueries = pgTable(
  'saved_queries',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    dataSourceId: text('data_source_id')
      .notNull()
      .references(() => dataSources.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    sqlTemplate: text('sql_template').notNull(),
    parameterDefinitions: jsonb('parameter_definitions').notNull().default(sql`'[]'::jsonb`),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updatedByUserId: text('updated_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workspaceIdx: index('saved_queries_workspace_idx').on(table.workspaceId),
    spaceIdx: index('saved_queries_space_idx').on(table.spaceId),
    groupIdx: index('saved_queries_group_idx').on(table.groupId),
    dataSourceIdx: index('saved_queries_data_source_idx').on(table.dataSourceId),
  }),
);

export const queryRuns = pgTable(
  'query_runs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    dataSourceId: text('data_source_id')
      .notNull()
      .references(() => dataSources.id, { onDelete: 'restrict' }),
    savedQueryId: text('saved_query_id')
      .notNull()
      .references(() => savedQueries.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: text('status').notNull(),
    parameters: jsonb('parameters').notNull().default(sql`'{}'::jsonb`),
    rowCount: integer('row_count').notNull().default(0),
    truncated: boolean('truncated').notNull().default(false),
    columns: jsonb('columns').notNull().default(sql`'[]'::jsonb`),
    rows: jsonb('rows').notNull().default(sql`'[]'::jsonb`),
    errorMessage: text('error_message'),
    durationMs: integer('duration_ms'),
    startedAt: timestamp('started_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp('finished_at', { mode: 'string', withTimezone: true }),
  },
  (table) => ({
    workspaceIdx: index('query_runs_workspace_idx').on(table.workspaceId),
    spaceIdx: index('query_runs_space_idx').on(table.spaceId),
    groupIdx: index('query_runs_group_idx').on(table.groupId),
    dataSourceIdx: index('query_runs_data_source_idx').on(table.dataSourceId),
    savedQueryIdx: index('query_runs_saved_query_idx').on(table.savedQueryId),
    actorIdx: index('query_runs_actor_idx').on(table.actorUserId),
    startedAtIdx: index('query_runs_started_at_idx').on(table.startedAt),
  }),
);

export const documentEntityMentions = pgTable(
  'document_entity_mentions',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    entityId: text('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    blockId: text('block_id').notNull(),
    label: text('label'),
    anchorId: text('anchor_id'),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    documentIdx: index('document_entity_mentions_document_idx').on(table.documentId),
    entityIdx: index('document_entity_mentions_entity_idx').on(table.entityId),
    spaceIdx: index('document_entity_mentions_space_idx').on(table.spaceId),
    groupIdx: index('document_entity_mentions_group_idx').on(table.groupId),
  }),
);

export const relations = pgTable(
  'relations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    groupId: text('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    fromEntityId: text('from_entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    toEntityId: text('to_entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    relationType: text('relation_type').notNull(),
    properties: jsonb('properties').notNull().default(sql`'{}'::jsonb`),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updatedByUserId: text('updated_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workspaceIdx: index('relations_workspace_idx').on(table.workspaceId),
    spaceIdx: index('relations_space_idx').on(table.spaceId),
    groupIdx: index('relations_group_idx').on(table.groupId),
    fromEntityIdx: index('relations_from_entity_idx').on(table.fromEntityId),
    toEntityIdx: index('relations_to_entity_idx').on(table.toEntityId),
  }),
);
