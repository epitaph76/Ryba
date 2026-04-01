import { describe, expect, it } from 'vitest';
import type { EntityTypeRecord } from '@ryba/types';

import {
  buildEntityDetailDraft,
  buildEntityTypeDraft,
  buildEntityUpdatePayload,
  createEmptyFieldDraft,
  fieldKeyify,
  serializeEntityTypeDraft,
  slugify,
} from './entity-detail-model';

const entityType: EntityTypeRecord = {
  id: 'type-project',
  workspaceId: 'workspace-1',
  name: 'Project',
  slug: 'project',
  description: 'Track projects',
  color: '#d92d20',
  icon: 'folder',
  isSystem: false,
  fields: [
    {
      id: 'field-status',
      workspaceId: 'workspace-1',
      entityTypeId: 'type-project',
      key: 'status',
      label: 'Status',
      fieldType: 'status',
      description: null,
      required: true,
      order: 0,
      config: {
        options: [
          { value: 'planned', label: 'planned', color: null },
          { value: 'active', label: 'active', color: null },
        ],
      },
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
    {
      id: 'field-budget',
      workspaceId: 'workspace-1',
      entityTypeId: 'type-project',
      key: 'budget',
      label: 'Budget',
      fieldType: 'number',
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
};

describe('entity-detail-model', () => {
  it('builds editable draft from typed entity', () => {
    const draft = buildEntityDetailDraft(
      {
        id: 'entity-1',
        workspaceId: 'workspace-1',
        spaceId: 'space-1',
        entityTypeId: 'type-project',
        title: 'Launch website',
        summary: 'Q2 initiative',
        properties: {
          status: 'active',
          budget: 2500,
        },
        createdByUserId: 'user-1',
        updatedByUserId: 'user-1',
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
      [entityType],
    );

    expect(draft).toEqual({
      entityTypeId: 'type-project',
      title: 'Launch website',
      summary: 'Q2 initiative',
      properties: {
        status: 'active',
        budget: '2500',
      },
    });
  });

  it('serializes detail draft back into API payload', () => {
    const payload = buildEntityUpdatePayload(
      {
        entityTypeId: 'type-project',
        title: 'Launch website',
        summary: 'Q2 initiative',
        properties: {
          status: 'planned',
          budget: '4300',
        },
      },
      [entityType],
    );

    expect(payload).toEqual({
      entityTypeId: 'type-project',
      title: 'Launch website',
      summary: 'Q2 initiative',
      properties: {
        status: 'planned',
        budget: 4300,
      },
    });
  });

  it('builds and serializes schema draft for entity types', () => {
    const draft = buildEntityTypeDraft(entityType);
    draft.fields.push({
      ...createEmptyFieldDraft(),
      key: 'kickoff_date',
      label: 'Kickoff Date',
      fieldType: 'date',
    });

    const serialized = serializeEntityTypeDraft(draft);

    expect(serialized.slug).toBe('project');
    expect(serialized.fields).toHaveLength(3);
    expect(serialized.fields[2]).toMatchObject({
      key: 'kickoff_date',
      label: 'Kickoff Date',
      fieldType: 'date',
      order: 2,
    });
  });

  it('normalizes slug and field key helpers', () => {
    expect(slugify('Project Board')).toBe('project-board');
    expect(fieldKeyify('Primary Contact')).toBe('primary_contact');
  });
});
