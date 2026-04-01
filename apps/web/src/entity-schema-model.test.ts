import { describe, expect, it } from 'vitest';
import type { EntityTypeRecord } from '@ryba/types';

import {
  buildEntityTypeInput,
  buildEntityUpdateInput,
  createEntityDraft,
  createEntityTypeDraft,
  createEmptyFieldDraft,
  getDefaultEntityTypeId,
  toFieldKey,
  toSlug,
} from './entity-schema-model';

describe('entity-schema-model', () => {
  const taskType: EntityTypeRecord = {
    id: 'task-type',
    workspaceId: 'workspace-1',
    name: 'Task',
    slug: 'task',
    description: 'Task schema',
    color: '#111827',
    icon: 'check-square',
    isSystem: true,
    fields: [
      {
        id: 'field-status',
        workspaceId: 'workspace-1',
        entityTypeId: 'task-type',
        key: 'status',
        label: 'Status',
        fieldType: 'status' as const,
        description: null,
        required: true,
        order: 0,
        config: {
          options: [
            { value: 'todo', label: 'todo', color: null },
            { value: 'done', label: 'done', color: null },
          ],
        },
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'field-tags',
        workspaceId: 'workspace-1',
        entityTypeId: 'task-type',
        key: 'tags',
        label: 'Tags',
        fieldType: 'multi_select' as const,
        description: null,
        required: false,
        order: 1,
        config: {
          options: [
            { value: 'core', label: 'core', color: null },
            { value: 'pilot', label: 'pilot', color: null },
          ],
          allowMultiple: true,
        },
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'field-blocked',
        workspaceId: 'workspace-1',
        entityTypeId: 'task-type',
        key: 'is_blocked',
        label: 'Blocked',
        fieldType: 'boolean' as const,
        description: null,
        required: false,
        order: 2,
        config: {},
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    ],
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  };

  const noteType: EntityTypeRecord = {
    ...taskType,
    id: 'note-type',
    name: 'Note',
    slug: 'note',
    fields: [],
  };

  it('creates an editable draft from entity values and serializes it back', () => {
    const draft = createEntityDraft(
      {
        id: 'entity-1',
        workspaceId: 'workspace-1',
        spaceId: 'space-1',
        entityTypeId: 'task-type',
        title: 'Ship S4',
        summary: 'Typed entity',
        properties: {
          status: 'todo',
          tags: ['core', 'pilot'],
          is_blocked: true,
        },
        createdByUserId: 'user-1',
        updatedByUserId: 'user-1',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      taskType,
      [taskType, noteType],
    );

    expect(draft.entityTypeId).toBe('task-type');
    expect(draft.properties.tags).toBe('core, pilot');
    expect(draft.properties.is_blocked).toBe(true);

    const payload = buildEntityUpdateInput(draft, taskType);
    expect(payload).toEqual({
      entityTypeId: 'task-type',
      title: 'Ship S4',
      summary: 'Typed entity',
      properties: {
        status: 'todo',
        tags: ['core', 'pilot'],
        is_blocked: true,
      },
    });
  });

  it('builds entity type payload from schema draft', () => {
    const schemaDraft = createEntityTypeDraft();
    schemaDraft.name = 'Vendor Profile';
    schemaDraft.color = '#123456';
    schemaDraft.fields = [
      {
        ...createEmptyFieldDraft(),
        key: 'website',
        label: 'Website',
        fieldType: 'url',
      },
      {
        ...createEmptyFieldDraft(),
        key: 'status',
        label: 'Status',
        fieldType: 'status',
        required: true,
        optionsText: 'lead, active, archived',
      },
    ];

    const payload = buildEntityTypeInput(schemaDraft);
    expect(payload.slug).toBe('vendor-profile');
    expect(payload.fields[1]).toEqual({
      key: 'status',
      label: 'Status',
      fieldType: 'status',
      description: null,
      required: true,
      config: {
        options: [
          { value: 'lead', label: 'lead', color: null },
          { value: 'active', label: 'active', color: null },
          { value: 'archived', label: 'archived', color: null },
        ],
      },
    });
  });

  it('picks note as default entity type and normalizes keys', () => {
    expect(getDefaultEntityTypeId([taskType, noteType])).toBe('note-type');
    expect(toSlug('Vendor Profile')).toBe('vendor-profile');
    expect(toFieldKey('Due Date')).toBe('due_date');
  });
});
