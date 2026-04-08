import { describe, expect, it } from 'vitest';

import { formatFieldValue, getFieldOptions, normalizeFieldValue, serializeFieldValue } from './field-renderers';

const baseField = {
  id: 'field-1',
  workspaceId: 'workspace-1',
  entityTypeId: 'type-1',
  key: 'status',
  label: 'Status',
  description: null,
  required: false,
  order: 0,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
} as const;

describe('field-renderers', () => {
  it('extracts select options from field config', () => {
    const options = getFieldOptions({
      ...baseField,
      fieldType: 'status',
      config: {
        options: [
          { value: 'draft', label: 'Draft', color: null },
          { value: 'active', label: 'Active', color: '#22c55e' },
        ],
      },
    });

    expect(options).toEqual([
      { value: 'draft', label: 'Draft', color: null },
      { value: 'active', label: 'Active', color: '#22c55e' },
    ]);
  });

  it('normalizes and serializes number fields through string editor state', () => {
    const field = {
      ...baseField,
      key: 'budget',
      label: 'Budget',
      fieldType: 'number',
      config: {},
    } as const;

    expect(normalizeFieldValue(field, 1250)).toBe('1250');
    expect(serializeFieldValue(field, '1250')).toBe(1250);
    expect(serializeFieldValue(field, '')).toBeUndefined();
  });

  it('formats relation values through entity titles when context exists', () => {
    const field = {
      ...baseField,
      key: 'related_company',
      label: 'Related company',
      fieldType: 'relation',
      config: {},
    } as const;

    const formatted = formatFieldValue(field, 'entity-company', {
      entities: [
        {
          id: 'entity-company',
          workspaceId: 'workspace-1',
          spaceId: 'space-1',
          groupId: null,
          entityTypeId: 'type-company',
          title: 'Acme Inc.',
          summary: null,
          properties: {},
          createdByUserId: 'user-1',
          updatedByUserId: 'user-1',
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
      ],
    });

    expect(formatted).toBe('Acme Inc.');
  });
});
