import type {
  DocumentBlock,
  DocumentEntityReference,
  DocumentId,
  DocumentLinkDefinition,
  DocumentLinkMode,
  DocumentRecord,
  EntityId,
} from '@ryba/types';

export interface DocumentLinkToken {
  key: string;
  mode: DocumentLinkMode;
  text: string;
  raw: string;
  start: number;
  end: number;
}

const DOCUMENT_LINK_PATTERN = /([A-Za-z][A-Za-z0-9_-]{0,63})(\*\*([\s\S]*?)\*\*|\$\$([\s\S]*?)\$\$)/g;

export const extractDocumentLinkTokens = (text: string): DocumentLinkToken[] => {
  const tokens: DocumentLinkToken[] = [];

  for (const match of text.matchAll(DOCUMENT_LINK_PATTERN)) {
    const raw = match[0];
    const key = match[1];
    const staticText = match[3];
    const syncText = match[4];
    const start = match.index ?? -1;

    if (!raw || !key || start < 0) {
      continue;
    }

    tokens.push({
      key,
      mode: typeof staticText === 'string' ? 'static' : 'sync',
      text: staticText ?? syncText ?? '',
      raw,
      start,
      end: start + raw.length,
    });
  }

  return tokens;
};

export const buildDocumentLinkToken = (input: {
  key: string;
  mode: DocumentLinkMode;
  text: string;
}) => {
  const delimiter = input.mode === 'static' ? '**' : '$$';
  return `${input.key}${delimiter}${input.text}${delimiter}`;
};

export const isDocumentLinkDefinitionReference = (
  reference: DocumentEntityReference,
): boolean => reference.kind === 'document_link_definition';

export const isDocumentLinkUsageReference = (
  reference: DocumentEntityReference,
): boolean => reference.kind === 'document_link_usage';

export const createDocumentLinkDefinitionReference = (input: {
  entityId: EntityId;
  blockId: string;
  key: string;
  mode: DocumentLinkMode;
  text: string;
  documentId: DocumentId | null;
}): DocumentEntityReference => ({
  entityId: input.entityId,
  label: input.key,
  anchorId: input.blockId,
  kind: 'document_link_definition',
  linkKey: input.key,
  linkText: input.text,
  linkMode: input.mode,
  sourceDocumentId: input.documentId,
  sourceBlockId: input.blockId,
});

export const createDocumentLinkUsageReference = (input: {
  entityId: EntityId;
  key: string;
  mode: DocumentLinkMode;
  text: string;
  sourceDocumentId: DocumentId;
  sourceBlockId: string | null;
}): DocumentEntityReference => ({
  entityId: input.entityId,
  label: input.key,
  anchorId: input.sourceBlockId,
  kind: 'document_link_usage',
  linkKey: input.key,
  linkText: input.text,
  linkMode: input.mode,
  sourceDocumentId: input.sourceDocumentId,
  sourceBlockId: input.sourceBlockId,
});

export const buildDocumentLinkDefinitionIndex = (
  documents: Array<Pick<DocumentRecord, 'id' | 'entityId' | 'title' | 'body'>>,
) => {
  const definitions = new Map<string, DocumentLinkDefinition>();

  for (const document of documents) {
    for (const block of document.body) {
      const referenceDefinitions = block.entityReferences.filter(isDocumentLinkDefinitionReference);
      const usageReferences = block.entityReferences.filter(isDocumentLinkUsageReference);
      const tokens = extractDocumentLinkTokens(block.text ?? '');

      for (const reference of referenceDefinitions) {
        if (
          !reference.linkKey ||
          !reference.linkMode ||
          typeof reference.linkText !== 'string'
        ) {
          continue;
        }

        definitions.set(reference.linkKey, {
          key: reference.linkKey,
          mode: reference.linkMode,
          text: reference.linkText,
          sourceDocumentId: reference.sourceDocumentId ?? document.id,
          sourceEntityId: document.entityId,
          sourceBlockId: reference.sourceBlockId ?? block.id,
          sourceTitle: document.title,
        });
      }

      if (referenceDefinitions.length > 0) {
        continue;
      }

      if (usageReferences.length > 0) {
        continue;
      }

      for (const token of tokens) {
        if (definitions.has(token.key)) {
          continue;
        }

        definitions.set(token.key, {
          key: token.key,
          mode: token.mode,
          text: token.text,
          sourceDocumentId: document.id,
          sourceEntityId: document.entityId,
          sourceBlockId: block.id,
          sourceTitle: document.title,
        });
      }
    }
  }

  return definitions;
};

export const replaceDocumentLinkTokensForPreview = (text: string) => {
  let normalized = text;

  for (const token of extractDocumentLinkTokens(text)) {
    normalized = normalized.replace(token.raw, token.text);
  }

  return normalized;
};

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const collectUsageReferencesByBlockId = (body: DocumentBlock[]) => {
  const usageByBlockId = new Map<string, DocumentEntityReference[]>();

  for (const block of body) {
    const usageReferences = block.entityReferences.filter(isDocumentLinkUsageReference);

    if (usageReferences.length > 0) {
      usageByBlockId.set(block.id, usageReferences);
    }
  }

  return usageByBlockId;
};
