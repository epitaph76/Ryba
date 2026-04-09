import type { DocumentRecord } from '@ryba/types';
import { describe, expect, it } from 'vitest';

import { buildCrossSubspaceDocumentLinkDefinitions } from './document-link-runtime';
import {
  buildDocumentPreviewText,
  buildEditorHtmlFromBlocks,
  createMentionToken,
  extractDocumentMentions,
  serializeEditorDocument,
} from './document-model';

describe('document-model', () => {
  it('extracts entity mentions from tokenized text', () => {
    expect(
      extractDocumentMentions('Discuss [[entity:ent-1|Acme]] and [[entity:ent-2]] next.'),
    ).toEqual([
      {
        entityId: 'ent-1',
        label: 'Acme',
        anchorId: null,
        kind: 'entity_mention',
      },
      {
        entityId: 'ent-2',
        label: null,
        anchorId: null,
        kind: 'entity_mention',
      },
    ]);
  });

  it('serializes editor json into document blocks and preserves spaces', () => {
    const blocks = serializeEditorDocument({
      type: 'doc',
      content: [
        {
          type: 'heading',
          content: [{ type: 'text', text: 'Sprint note' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Link [[entity:ent-1|Task]] to the draft. ' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'First [[entity:ent-2]] item' }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(blocks).toEqual([
      {
        id: 'block-1',
        kind: 'heading',
        text: 'Sprint note',
        entityReferences: [],
      },
      {
        id: 'block-2',
        kind: 'paragraph',
        text: 'Link [[entity:ent-1|Task]] to the draft. ',
        entityReferences: [
          {
            entityId: 'ent-1',
            label: 'Task',
            anchorId: null,
            kind: 'entity_mention',
          },
        ],
      },
      {
        id: 'block-3',
        kind: 'list_item',
        text: 'First [[entity:ent-2]] item',
        entityReferences: [
          {
            entityId: 'ent-2',
            label: null,
            anchorId: null,
            kind: 'entity_mention',
          },
        ],
      },
    ]);
  });

  it('keeps static bare link keys as child references without duplicating the parent token', () => {
    const blocks = serializeEditorDocument(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'See shared_block for context.' }],
          },
        ],
      },
      {
        currentDocumentId: 'doc-target',
        ownerEntityId: 'ent-target',
        linkDefinitions: [
          {
            key: 'shared_block',
            definitionKey: 'shared_block',
            mode: 'static',
            text: 'Canonical copy',
            sourceDocumentId: 'doc-source',
            sourceEntityId: 'ent-source',
            sourceBlockId: 'block-source',
            sourceTitle: 'Source note',
            sourceGroupId: null,
            sourceGroupSlug: null,
          },
        ],
      },
    );

    expect(blocks[0]).toEqual({
      id: 'block-1',
      kind: 'paragraph',
      text: 'See shared_block for context.',
      entityReferences: [
        {
          entityId: 'ent-source',
          label: 'shared_block',
          anchorId: 'block-source',
          kind: 'document_link_usage',
          linkKey: 'shared_block',
          definitionKey: 'shared_block',
          linkText: 'Canonical copy',
          linkMode: 'static',
          sourceDocumentId: 'doc-source',
          sourceBlockId: 'block-source',
          sourceGroupId: null,
          sourceGroupSlug: null,
        },
      ],
    });
  });

  it('builds escaped html and preview text from mentions and document links', () => {
    const blocks = [
      {
        id: 'block-1',
        kind: 'heading' as const,
        text: 'Launch <plan>',
        entityReferences: [],
      },
      {
        id: 'block-2',
        kind: 'paragraph' as const,
        text: createMentionToken({
          id: 'ent-9',
          title: 'Launch task',
        }),
        entityReferences: [
          {
            entityId: 'ent-9',
            label: 'Launch task',
            anchorId: null,
            kind: 'entity_mention' as const,
          },
        ],
      },
      {
        id: 'block-3',
        kind: 'paragraph' as const,
        text: 'shared_static',
        entityReferences: [
          {
            entityId: 'ent-2',
            label: 'shared_static',
            anchorId: 'block-static',
            kind: 'document_link_usage' as const,
            linkKey: 'shared_static',
            linkText: 'Static copy',
            linkMode: 'static' as const,
            sourceDocumentId: 'doc-static',
            sourceBlockId: 'block-static',
          },
        ],
      },
      {
        id: 'block-4',
        kind: 'paragraph' as const,
        text: 'shared_block$$Synced copy$$',
        entityReferences: [
          {
            entityId: 'ent-1',
            label: 'shared_block',
            anchorId: 'block-source',
            kind: 'document_link_usage' as const,
            linkKey: 'shared_block',
            linkText: 'Synced copy',
            linkMode: 'sync' as const,
            sourceDocumentId: 'doc-source',
            sourceBlockId: 'block-source',
          },
        ],
      },
    ];

    expect(buildEditorHtmlFromBlocks(blocks)).toContain('&lt;plan&gt;');
    expect(buildDocumentPreviewText(blocks)).toContain('Launch');
    expect(buildDocumentPreviewText(blocks)).toContain('Launch task');
    expect(buildDocumentPreviewText(blocks)).toContain('Static copy');
    expect(buildDocumentPreviewText(blocks)).toContain('Synced copy');
  });

  it('resolves qualified keys from another subspace without creating a local definition', () => {
    const definitionDocuments: DocumentRecord[] = [
      createDefinitionDocument({
        id: 'doc-root',
        entityId: 'ent-root',
        title: 'Root source',
        groupId: null,
        blockId: 'root-definition',
        key: 'shared_note',
        text: 'Root canonical',
      }),
      createDefinitionDocument({
        id: 'doc-group',
        entityId: 'ent-group',
        title: 'Group source',
        groupId: 'group-1',
        blockId: 'group-definition',
        key: 'shared_note',
        text: 'Group canonical',
      }),
    ];
    const definitions = buildCrossSubspaceDocumentLinkDefinitions(definitionDocuments, {
      currentGroupId: 'group-1',
      groupSlugById: new Map([['group-1', 'delivery']]),
    });
    const blocks = serializeEditorDocument(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Compare root.shared_note and shared_note.' }],
          },
        ],
      },
      {
        currentDocumentId: 'doc-consumer',
        ownerEntityId: 'ent-consumer',
        linkDefinitions: definitions,
      },
    );

    expect(blocks[0]?.text).toBe('Compare root.shared_note and shared_note.');
    expect(blocks[0]?.entityReferences).toEqual([
      expect.objectContaining({
        kind: 'document_link_usage',
        linkKey: 'root.shared_note',
        definitionKey: 'shared_note',
        entityId: 'ent-root',
        sourceGroupId: null,
        sourceGroupSlug: null,
      }),
      expect.objectContaining({
        kind: 'document_link_usage',
        linkKey: 'shared_note',
        definitionKey: 'shared_note',
        entityId: 'ent-group',
        sourceGroupId: 'group-1',
        sourceGroupSlug: 'delivery',
      }),
    ]);
    expect(
      blocks[0]?.entityReferences.some((reference) => reference.kind === 'document_link_definition'),
    ).toBe(false);
  });
});

const createDefinitionDocument = (
  input: {
    id: string;
    entityId: string;
    title: string;
    groupId: string | null;
    blockId: string;
    key: string;
    text: string;
  },
): DocumentRecord => ({
  id: input.id,
  workspaceId: 'ws-1',
  spaceId: 'space-1',
  groupId: input.groupId,
  entityId: input.entityId,
  title: input.title,
  previewText: input.text,
  createdByUserId: 'user-1',
  updatedByUserId: 'user-1',
  createdAt: '2026-04-09T00:00:00.000Z',
  updatedAt: '2026-04-09T00:00:00.000Z',
  body: [
    {
      id: input.blockId,
      kind: 'paragraph',
      text: `${input.key}**${input.text}**`,
      entityReferences: [],
    },
  ],
});
