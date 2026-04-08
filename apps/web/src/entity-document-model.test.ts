import { describe, expect, it } from 'vitest';

import type { DocumentDetailRecord } from '@ryba/types';

import {
  buildEntityDocumentDraft,
  buildEntityDocumentPayload,
  getEntityDocumentOwnerEntityId,
  isEntityOwnedDocument,
  stripEntityDocumentMarker,
} from './entity-document-model';

const baseDetail: DocumentDetailRecord = {
  document: {
    id: 'doc-1',
    workspaceId: 'workspace-1',
    spaceId: 'space-1',
    groupId: null,
    entityId: 'ent-1',
    title: 'Launch plan',
    body: [
      {
        id: 'entity-document-root-block',
        kind: 'entity_reference',
        text: null,
        entityReferences: [
          {
            entityId: 'ent-1',
            label: 'Launch plan',
            anchorId: 'entity-document-root',
          },
        ],
      },
      {
        id: 'block-2',
        kind: 'paragraph',
        text: 'Link [[entity:ent-2|Task]] to the plan.',
        entityReferences: [
          {
            entityId: 'ent-2',
            label: 'Task',
            anchorId: null,
          },
        ],
      },
    ],
    previewText: 'Link Task to the plan.',
    createdByUserId: 'user-1',
    updatedByUserId: 'user-1',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
  entity: {
    id: 'ent-1',
    title: 'Launch plan',
    summary: 'Roadmap entity',
    entityTypeId: null,
  },
  mentions: [
    {
      entityId: 'ent-1',
      label: 'Launch plan',
      anchorId: 'entity-document-root',
    },
    {
      entityId: 'ent-2',
      label: 'Task',
      anchorId: null,
    },
  ],
  mentionedEntities: [],
};

describe('entity-document-model', () => {
  it('strips entity ownership marker from editable draft', () => {
    expect(buildEntityDocumentDraft({ id: 'ent-1', title: 'Launch plan' }, baseDetail)).toEqual({
      title: 'Launch plan',
      body: [
        {
          id: 'block-2',
          kind: 'paragraph',
          text: 'Link [[entity:ent-2|Task]] to the plan.',
          entityReferences: [
            {
              entityId: 'ent-2',
              label: 'Task',
              anchorId: null,
            },
          ],
        },
      ],
    });
  });

  it('re-injects entity ownership marker into saved payload', () => {
    const payload = buildEntityDocumentPayload(
      { id: 'ent-1', title: 'Launch plan' },
      {
        title: '',
        body: stripEntityDocumentMarker('ent-1', baseDetail.document.body),
      },
    );

    expect(payload.title).toBe('Launch plan');
    expect(payload.body[0]).toEqual({
      id: 'entity-document-root-block',
      kind: 'entity_reference',
      text: null,
      entityReferences: [
        {
          entityId: 'ent-1',
          label: 'Launch plan',
          anchorId: 'entity-document-root',
        },
      ],
    });
  });

  it('detects document owner entity by marker', () => {
    expect(getEntityDocumentOwnerEntityId(baseDetail)).toBe('ent-1');
    expect(isEntityOwnedDocument(baseDetail, 'ent-1')).toBe(true);
    expect(isEntityOwnedDocument(baseDetail, 'ent-2')).toBe(false);
  });
});
