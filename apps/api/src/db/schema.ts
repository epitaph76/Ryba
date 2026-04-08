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
