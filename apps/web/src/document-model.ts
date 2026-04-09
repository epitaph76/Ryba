import type {
  DocumentBlock,
  DocumentEntityReference,
  DocumentLinkDefinition,
  DocumentRecord,
  EntityRecord,
} from '@ryba/types';
import {
  buildDocumentLinkToken,
  createDocumentLinkDefinitionReference,
  createDocumentLinkUsageReference,
  escapeRegExp,
  extractDocumentLinkTokens,
  isDocumentLinkDefinitionReference,
  parseDocumentLinkKey,
  replaceDocumentLinkTokensForPreview,
} from './document-link-runtime';

type EditorJsonNode = {
  type?: string;
  text?: string;
  content?: EditorJsonNode[];
};

interface DocumentSerializationContext {
  currentDocumentId?: string | null;
  ownerEntityId?: string | null;
  linkDefinitions?: DocumentLinkDefinition[] | Map<string, DocumentLinkDefinition>;
}

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

export const buildDocumentDraftForEntity = (
  entity: Pick<EntityRecord, 'title'> | null,
  document: Pick<DocumentRecord, 'title' | 'body'> | null,
): DocumentDraft =>
  document
    ? {
        title: document.title,
        body: document.body,
      }
    : {
        title: entity?.title ?? '',
        body: [],
      };

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
    kind: 'entity_mention' as const,
  })).filter((reference) => reference.entityId.length > 0);

export const serializeEditorDocument = (
  editorJson: EditorJsonNode | null | undefined,
  context: DocumentSerializationContext = {},
): DocumentBlock[] => {
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
        const text = collectNodeText(listItem);

        if (!hasRenderableContent(text)) {
          continue;
        }

        const blockId = `block-${blocks.length + 1}`;

        blocks.push(
          buildNormalizedBlock(
            {
              id: blockId,
              kind: 'list_item',
              text,
              entityReferences: [],
            },
            context,
          ),
        );
      }

      continue;
    }

    const text = collectNodeText(node);

    if (!hasRenderableContent(text) && node.type !== 'paragraph') {
      continue;
    }

    const blockId = `block-${blocks.length + 1}`;

    blocks.push(
      buildNormalizedBlock(
        {
          id: blockId,
          kind: toBlockKind(node.type),
          text: text.length > 0 ? text : null,
          entityReferences: [],
        },
        context,
      ),
    );
  }

  return blocks;
};

export const createDocumentBlocksFromEditorJson = serializeEditorDocument;

export const normalizeDocumentBlocks = (
  blocks: DocumentBlock[],
  context: DocumentSerializationContext = {},
) =>
  blocks.map((block) => {
    if (
      block.kind === 'entity_reference' ||
      block.entityReferences.some(isDocumentLinkDefinitionReference) && block.text === null
    ) {
      return block;
    }

    return buildNormalizedBlock(block, context);
  });

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
    .map((block) => {
      if (!block.text) {
        return block.entityReferences
          .filter((reference) => reference.kind !== 'document_link_definition')
          .map((reference) => reference.label ?? reference.linkText ?? reference.entityId)
          .join(' ');
      }

      return replaceDocumentLinksAndMentions(block.text, block.entityReferences);
    })
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
    body.flatMap((block) =>
      block.entityReferences
        .filter((reference) => reference.kind !== 'document_link_definition')
        .map((reference) => reference.entityId),
    ),
  );

  return entities.filter((entity) => mentionedEntityIds.has(entity.id));
};

export const serializeDocumentDraft = (draft: DocumentDraft) => ({
  title: draft.title.trim(),
  body: draft.body,
});

const buildNormalizedBlock = (
  block: DocumentBlock,
  context: DocumentSerializationContext,
): DocumentBlock => {
  const text = typeof block.text === 'string' ? block.text : '';
  const definitionMap = toDefinitionMap(context.linkDefinitions);
  const normalizedText = replaceBareLinkKeys(text, definitionMap, context.currentDocumentId ?? null);
  const { text: nextText, linkReferences } = resolveDocumentLinks(
    text,
    normalizedText,
    block.id,
    definitionMap,
    context,
  );
  const entityReferences = [
    ...extractDocumentMentions(nextText),
    ...linkReferences,
  ];

  return {
    ...block,
    text: nextText.length > 0 ? nextText : block.kind === 'paragraph' ? null : nextText,
    entityReferences,
  };
};

const resolveDocumentLinks = (
  originalText: string,
  text: string,
  blockId: string,
  definitionMap: Map<string, DocumentLinkDefinition>,
  context: DocumentSerializationContext,
): {
  text: string;
  linkReferences: DocumentEntityReference[];
} => {
  const tokens = extractDocumentLinkTokens(text);
  const currentDocumentId = context.currentDocumentId ?? null;
  const staticBareUsages = findStaticBareUsageDefinitions(
    originalText,
    definitionMap,
    currentDocumentId,
  );

  if (tokens.length === 0 && staticBareUsages.length === 0) {
    return {
      text,
      linkReferences: [],
    };
  }

  let cursor = 0;
  let nextText = '';
  const linkReferences: DocumentEntityReference[] = [];

  for (const token of tokens) {
    nextText += text.slice(cursor, token.start);

    const definition = definitionMap.get(token.key);
    const isUsage =
      !!definition &&
      definition.sourceDocumentId !== currentDocumentId;

    if (isUsage) {
      const nextMode = definition.mode;
      const nextTokenText = nextMode === 'static' ? definition.text : token.text;

      nextText +=
        nextMode === 'static'
          ? definition.key
          : buildDocumentLinkToken({
              key: definition.key,
              mode: nextMode,
              text: nextTokenText,
            });
      linkReferences.push(
        createDocumentLinkUsageReference({
          entityId: definition.sourceEntityId,
          key: definition.key,
          definitionKey: definition.definitionKey,
          mode: nextMode,
          text: nextTokenText,
          sourceDocumentId: definition.sourceDocumentId,
          sourceBlockId: definition.sourceBlockId,
          sourceGroupId: definition.sourceGroupId,
          sourceGroupSlug: definition.sourceGroupSlug,
        }),
      );
    } else if (context.ownerEntityId && parseDocumentLinkKey(token.key)?.qualifier === null) {
      nextText += token.raw;
      linkReferences.push(
        createDocumentLinkDefinitionReference({
          entityId: context.ownerEntityId,
          blockId,
          key: token.key,
          definitionKey: token.definitionKey,
          mode: token.mode,
          text: token.text,
          documentId: currentDocumentId,
        }),
      );
    } else {
      nextText += token.raw;
    }

    cursor = token.end;
  }

  nextText += text.slice(cursor);

  for (const definition of staticBareUsages) {
    linkReferences.push(
      createDocumentLinkUsageReference({
        entityId: definition.sourceEntityId,
        key: definition.key,
        definitionKey: definition.definitionKey,
        mode: 'static',
        text: definition.text,
        sourceDocumentId: definition.sourceDocumentId,
        sourceBlockId: definition.sourceBlockId,
        sourceGroupId: definition.sourceGroupId,
        sourceGroupSlug: definition.sourceGroupSlug,
      }),
    );
  }

  return {
    text: nextText,
    linkReferences,
  };
};

const replaceBareLinkKeys = (
  text: string,
  definitionMap: Map<string, DocumentLinkDefinition>,
  currentDocumentId: string | null,
) => {
  let nextText = text;
  const definitions = Array.from(definitionMap.values())
    .filter((definition) => definition.sourceDocumentId !== currentDocumentId)
    .sort((left, right) => right.key.length - left.key.length);

  for (const definition of definitions) {
    const pattern = new RegExp(
      `(^|[^A-Za-z0-9_.-])(${escapeRegExp(definition.key)})\\b(?!\\*\\*|\\$\\$)`,
      'g',
    );

    nextText = nextText.replace(pattern, (_, prefix: string) => {
      return definition.mode === 'sync'
        ? `${prefix}${buildDocumentLinkToken({
            key: definition.key,
            mode: definition.mode,
            text: definition.text,
          })}`
        : `${prefix}${definition.key}`;
    });
  }

  return nextText;
};

const replaceDocumentLinksAndMentions = (text: string, references: DocumentEntityReference[]) => {
  let normalized = replaceDocumentLinkTokensForPreview(text);

  for (const reference of references) {
    if (
      reference.kind !== 'document_link_usage' ||
      reference.linkMode !== 'static' ||
      !reference.linkKey ||
      typeof reference.linkText !== 'string'
    ) {
      continue;
    }

    const token = new RegExp(
      `(^|[^A-Za-z0-9_.-])(${escapeRegExp(reference.linkKey)})\\b(?!\\*\\*|\\$\\$)`,
      'g',
    );

    normalized = normalized.replace(token, (_, prefix: string) => {
      return `${prefix}${reference.linkText}`;
    });
  }

  for (const reference of references) {
    if (reference.kind === 'document_link_definition' || reference.kind === 'document_link_usage') {
      continue;
    }

    const token = new RegExp(
      String.raw`\[\[entity:${escapeRegExp(reference.entityId)}(?:\|[^\]]+)?\]\]`,
      'g',
    );

    normalized = normalized.replace(token, reference.label ?? reference.entityId);
  }

  return normalized;
};

const findStaticBareUsageDefinitions = (
  text: string,
  definitionMap: Map<string, DocumentLinkDefinition>,
  currentDocumentId: string | null,
) => {
  const definitions = Array.from(definitionMap.values())
    .filter(
      (definition) =>
        definition.mode === 'static' && definition.sourceDocumentId !== currentDocumentId,
    )
    .sort((left, right) => right.key.length - left.key.length);
  const occupiedRanges = extractDocumentLinkTokens(text).map((token) => ({
    start: token.start,
    end: token.end,
  }));
  const matches: DocumentLinkDefinition[] = [];

  for (const definition of definitions) {
    const pattern = new RegExp(
      `(^|[^A-Za-z0-9_.-])(${escapeRegExp(definition.key)})\\b(?!\\*\\*|\\$\\$)`,
      'g',
    );

    for (const match of text.matchAll(pattern)) {
      const prefix = match[1] ?? '';
      const key = match[2];
      const matchIndex = match.index ?? -1;

      if (!key || matchIndex < 0) {
        continue;
      }

      const start = matchIndex + prefix.length;
      const end = start + key.length;
      const overlaps = occupiedRanges.some((range) => start < range.end && end > range.start);

      if (overlaps) {
        continue;
      }

      occupiedRanges.push({ start, end });
      matches.push(definition);
    }
  }

  return matches;
};

const hasRenderableContent = (value: string) => value.replace(/\u00a0/g, ' ').trim().length > 0;

const collectNodeText = (node: EditorJsonNode): string => {
  if (typeof node.text === 'string') {
    return node.text;
  }

  if (node.type === 'hardBreak') {
    return '\n';
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

const toDefinitionMap = (
  definitions?: DocumentLinkDefinition[] | Map<string, DocumentLinkDefinition>,
) => {
  if (!definitions) {
    return new Map<string, DocumentLinkDefinition>();
  }

  if (definitions instanceof Map) {
    return definitions;
  }

  return new Map(definitions.map((definition) => [definition.key, definition]));
};
