import { index, jsonb, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core';
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
    fromEntityIdx: index('relations_from_entity_idx').on(table.fromEntityId),
    toEntityIdx: index('relations_to_entity_idx').on(table.toEntityId),
  }),
);
