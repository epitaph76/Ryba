import { describe, expect, it } from 'vitest';
import type { EntityRecord, EntityTypeRecord } from '@ryba/types';

import {
  buildDraftFromSavedView,
  buildStructuredFields,
  buildStructuredRows,
  createDefaultTableDraft,
  createStructuredViewDraft,
  getColumnId,
  moveColumn,
  normalizeSavedViewConfig,
  serializeStructuredViewDraft,
  syncStructuredViewDraft,
} from './table-model';

const entityTypes: EntityTypeRecord[] = [
  {
    id: 'type-task',
    workspaceId: 'workspace-1',
    name: 'Task',
    slug: 'task',
    description: null,
    color: null,
    icon: null,
    isSystem: false,
    fields: [
      {
        id: 'field-status',
        workspaceId: 'workspace-1',
        entityTypeId: 'type-task',
        key: 'status',
        label: 'Статус',
        fieldType: 'status' as const,
        description: null,
        required: false,
        order: 0,
        config: {
          options: [
            { value: 'todo', label: 'To do', color: null },
            { value: 'done', label: 'Done', color: null },
          ],
        },
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'field-due-date',
        workspaceId: 'workspace-1',
        entityTypeId: 'type-task',
        key: 'due_date',
        label: 'Срок',
        fieldType: 'date' as const,
        description: null,
        required: false,
        order: 1,
        config: {},
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ],
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
];

const entities: EntityRecord[] = [
  {
    id: 'task-1',
    workspaceId: 'workspace-1',
    spaceId: 'space-1',
    entityTypeId: 'type-task',
    title: 'Prepare review',
    summary: 'Needs action',
    properties: {
      status: 'todo',
      due_date: '2026-04-08',
    },
    createdByUserId: 'user-1',
    updatedByUserId: 'user-1',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-04T00:00:00.000Z',
  },
  {
    id: 'task-2',
    workspaceId: 'workspace-1',
    spaceId: 'space-1',
    entityTypeId: 'type-task',
    title: 'Close ticket',
    summary: 'Already done',
    properties: {
      status: 'done',
      due_date: '2026-04-02',
    },
    createdByUserId: 'user-1',
    updatedByUserId: 'user-1',
    createdAt: '2026-04-02T00:00:00.000Z',
    updatedAt: '2026-04-05T00:00:00.000Z',
  },
];

describe('table-model', () => {
  it('filters and sorts rows using typed property fields', () => {
    const draft = createStructuredViewDraft(entityTypes, 'type-task', 'table');
    draft.config.filters = [
      {
        id: 'filter-status',
        key: 'status',
        source: 'property',
        operator: 'not_equals',
        value: 'done',
      },
    ];
    draft.config.sort = [
      {
        key: 'due_date',
        source: 'property',
        direction: 'asc',
      },
    ];

    const result = buildStructuredRows({
      entities,
      entityTypes,
      draft,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.entity.id).toBe('task-1');
  });

  it('normalizes saved view config against available fields and preserves visible columns', () => {
    const fields = buildStructuredFields(entityTypes, 'type-task');
    const config = normalizeSavedViewConfig(
      {
        filters: [],
        sort: [],
        columns: [
          {
            key: 'status',
            source: 'property',
            visible: true,
            width: 180,
          },
        ],
      },
      fields,
    );

    expect(config.columns.map((column) => getColumnId(column))).toContain('system:title');
    expect(config.columns.map((column) => getColumnId(column))).toContain('property:status');
    expect(config.columns.find((column) => column.key === 'status')?.visible).toBe(true);
  });

  it('serializes and restores a saved view draft without losing entity type and view type', () => {
    const draft = createStructuredViewDraft(entityTypes, 'type-task', 'list');
    draft.name = 'Мои задачи';
    draft.description = 'Компактный список';

    const payload = serializeStructuredViewDraft(draft, entityTypes);

    const restored = buildDraftFromSavedView(
      {
        id: 'view-1',
        workspaceId: 'workspace-1',
        spaceId: 'space-1',
        name: payload.name,
        description: payload.description,
        entityTypeId: payload.entityTypeId,
        viewType: payload.viewType,
        config: payload.config,
        createdByUserId: 'user-1',
        updatedByUserId: 'user-1',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      entityTypes,
    );

    expect(restored.name).toBe('Мои задачи');
    expect(restored.description).toBe('Компактный список');
    expect(restored.entityTypeId).toBe('type-task');
    expect(restored.viewType).toBe('list');
  });

  it('moves columns left and right without losing order', () => {
    const draft = createStructuredViewDraft(entityTypes, 'type-task', 'table');
    const titleColumn = draft.config.columns.find((column) => column.key === 'title');
    const summaryColumn = draft.config.columns.find((column) => column.key === 'summary');

    if (!titleColumn || !summaryColumn) {
      throw new Error('Default columns are missing');
    }

    const moved = moveColumn(draft.config.columns, getColumnId(summaryColumn), 'left');
    const titleIndex = moved.findIndex((column) => column.key === 'title');
    const summaryIndex = moved.findIndex((column) => column.key === 'summary');

    expect(summaryIndex).toBe(titleIndex - 1);
    expect(moved[summaryIndex]?.key).toBe('summary');
    expect(moved[summaryIndex + 1]?.key).toBe('title');
  });

  it('creates and re-syncs a default draft against available fields', () => {
    const draft = createDefaultTableDraft(entityTypes, 'list');
    draft.entityTypeId = 'type-task';
    draft.config.columns = [
      {
        key: 'status',
        source: 'property',
        visible: true,
        width: 160,
      },
    ];

    const synced = syncStructuredViewDraft(draft, entityTypes);

    expect(synced.viewType).toBe('list');
    expect(synced.config.columns.map((column) => getColumnId(column))).toContain('system:title');
    expect(synced.config.columns.map((column) => getColumnId(column))).toContain('property:status');
  });
});
