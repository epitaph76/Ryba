import type {
  DocumentBlock,
  DocumentEntityReference,
  DocumentRecord,
  EntityRecord,
} from '@ryba/types';

type EditorJsonNode = {
  type?: string;
  text?: string;
  content?: EditorJsonNode[];
};

const ENTITY_MENTION_PATTERN = /\[\[entity:([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export interface DocumentDraft {
  title: string;
  body: DocumentBlock[];
}

export const createMentionToken = (entity: Pick<EntityRecord, 'id' | 'title'>) =>
  `[[entity:${entity.id}|${entity.title}]]`;

export const buildEntityMentionToken = createMentionToken;

export const createEmptyDocumentDraft = (): DocumentDraft => ({
  title: '',
  body: [],
});

export const buildDocumentDraft = (
  document: Pick<DocumentRecord, 'title' | 'body'> | null,
): DocumentDraft =>
  document
    ? {
        title: document.title,
        body: document.body,
      }
    : createEmptyDocumentDraft();

export const extractDocumentMentions = (text: string): DocumentEntityReference[] =>
  Array.from(text.matchAll(ENTITY_MENTION_PATTERN), (match) => ({
    entityId: match[1]?.trim() ?? '',
    label: match[2]?.trim() || null,
    anchorId: null,
  })).filter((reference) => reference.entityId.length > 0);

export const serializeEditorDocument = (editorJson: EditorJsonNode | null | undefined): DocumentBlock[] => {
  if (!editorJson?.content?.length) {
    return [];
  }

  const blocks: DocumentBlock[] = [];

  for (const node of editorJson.content) {
    if (!node?.type) {
      continue;
    }

    if (node.type === 'bulletList' || node.type === 'orderedList') {
      for (const listItem of node.content ?? []) {
        const text = collectNodeText(listItem).trim();

        if (!text) {
          continue;
        }

        blocks.push({
          id: `block-${blocks.length + 1}`,
          kind: 'list_item',
          text,
          entityReferences: extractDocumentMentions(text),
        });
      }

      continue;
    }

    const text = collectNodeText(node).trim();

    if (!text && node.type !== 'paragraph') {
      continue;
    }

    blocks.push({
      id: `block-${blocks.length + 1}`,
      kind: toBlockKind(node.type),
      text: text || null,
      entityReferences: text ? extractDocumentMentions(text) : [],
    });
  }

  return blocks;
};

export const createDocumentBlocksFromEditorJson = serializeEditorDocument;

export const buildEditorHtmlFromBlocks = (blocks: DocumentBlock[]): string => {
  if (blocks.length === 0) {
    return '<p></p>';
  }

  return blocks
    .map((block) => {
      const text = escapeHtml(block.text ?? '');

      switch (block.kind) {
        case 'heading':
          return `<h2>${text}</h2>`;
        case 'list_item':
          return `<ul><li><p>${text}</p></li></ul>`;
        case 'entity_reference':
          return `<p>${text}</p>`;
        case 'paragraph':
        default:
          return `<p>${text}</p>`;
      }
    })
    .join('');
};

export const buildDocumentPreviewText = (blocks: DocumentBlock[]) =>
  blocks
    .map((block) =>
      block.text ?? block.entityReferences.map((reference) => reference.label ?? reference.entityId).join(' '),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);

export const buildMentionTargetOptions = (entities: EntityRecord[]) =>
  entities.map((entity) => ({
    id: entity.id,
    label: entity.title,
    description: entity.summary ?? 'Без краткого описания',
  }));

export const findMentionedEntities = (body: DocumentBlock[], entities: EntityRecord[]) => {
  const mentionedEntityIds = new Set(
    body.flatMap((block) => block.entityReferences.map((reference) => reference.entityId)),
  );

  return entities.filter((entity) => mentionedEntityIds.has(entity.id));
};

export const serializeDocumentDraft = (draft: DocumentDraft) => ({
  title: draft.title.trim(),
  body: draft.body,
});

const collectNodeText = (node: EditorJsonNode): string => {
  if (typeof node.text === 'string') {
    return node.text;
  }

  return (node.content ?? []).map(collectNodeText).join('');
};

const toBlockKind = (nodeType: string): DocumentBlock['kind'] => {
  if (nodeType === 'heading') {
    return 'heading';
  }

  if (nodeType === 'listItem') {
    return 'list_item';
  }

  return 'paragraph';
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
