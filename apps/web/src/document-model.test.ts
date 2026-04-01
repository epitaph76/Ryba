import { describe, expect, it } from 'vitest';

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
      },
      {
        entityId: 'ent-2',
        label: null,
        anchorId: null,
      },
    ]);
  });

  it('serializes editor json into document blocks and mention references', () => {
    const blocks = serializeEditorDocument({
      type: 'doc',
      content: [
        {
          type: 'heading',
          content: [{ type: 'text', text: 'Sprint note' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Link [[entity:ent-1|Task]] to the draft.' }],
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
        text: 'Link [[entity:ent-1|Task]] to the draft.',
        entityReferences: [
          {
            entityId: 'ent-1',
            label: 'Task',
            anchorId: null,
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
          },
        ],
      },
    ]);
  });

  it('builds escaped html and preview text from blocks', () => {
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
          },
        ],
      },
    ];

    expect(buildEditorHtmlFromBlocks(blocks)).toContain('&lt;plan&gt;');
    expect(buildDocumentPreviewText(blocks)).toContain('Launch');
    expect(buildDocumentPreviewText(blocks)).toContain('entity:ent-9');
  });
});
