import type { DocumentBlock, DocumentEntityReference, DocumentId, DocumentRecord } from './document';
import type { EntityId } from './entity';
import type { GroupId } from './workspace';

export type DocumentLinkMode = 'static' | 'sync';
export const ROOT_DOCUMENT_LINK_QUALIFIER = 'root';

export interface DocumentLinkToken {
  key: string;
  definitionKey: string;
  qualifier: string | null;
  mode: DocumentLinkMode;
  text: string;
  raw: string;
  start: number;
  end: number;
}

export interface DocumentLinkDefinition {
  key: string;
  definitionKey: string;
  mode: DocumentLinkMode;
  text: string;
  sourceDocumentId: DocumentId;
  sourceEntityId: EntityId;
  sourceBlockId: string;
  sourceTitle: string;
  sourceGroupId: GroupId | null;
  sourceGroupSlug: string | null;
}

const DOCUMENT_LINK_KEY_PATTERN = /^(?:([a-z0-9]+(?:-[a-z0-9]+)*)\.)?([A-Za-z][A-Za-z0-9_-]{0,63})$/;
const DOCUMENT_LINK_PATTERN =
  /((?:[a-z0-9]+(?:-[a-z0-9]+)*\.)?[A-Za-z][A-Za-z0-9_-]{0,63})(\*\*([\s\S]*?)\*\*|\$\$([\s\S]*?)\$\$)/g;

export const parseDocumentLinkKey = (value: string) => {
  const match = value.match(DOCUMENT_LINK_KEY_PATTERN);

  if (!match) {
    return null;
  }

  return {
    key: value,
    qualifier: match[1] ?? null,
    definitionKey: match[2] ?? value,
  };
};

export const isQualifiedDocumentLinkKey = (value: string) => parseDocumentLinkKey(value)?.qualifier !== null;

export const buildQualifiedDocumentLinkKey = (qualifier: string, definitionKey: string) =>
  `${qualifier}.${definitionKey}`;

export const getDocumentLinkQualifierForGroup = (groupSlug: string | null) =>
  groupSlug ?? ROOT_DOCUMENT_LINK_QUALIFIER;

export const extractDocumentLinkTokens = (text: string): DocumentLinkToken[] => {
  const tokens: DocumentLinkToken[] = [];

  for (const match of text.matchAll(DOCUMENT_LINK_PATTERN)) {
    const raw = match[0];
    const key = match[1];
    const staticText = match[3];
    const syncText = match[4];
    const start = match.index ?? -1;
    const parsedKey = typeof key === 'string' ? parseDocumentLinkKey(key) : null;

    if (!raw || !parsedKey || start < 0) {
      continue;
    }

    tokens.push({
      key: parsedKey.key,
      definitionKey: parsedKey.definitionKey,
      qualifier: parsedKey.qualifier,
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
  definitionKey?: string;
  mode: DocumentLinkMode;
  text: string;
  documentId: DocumentId | null;
  sourceGroupId?: GroupId | null;
  sourceGroupSlug?: string | null;
}): DocumentEntityReference => ({
  entityId: input.entityId,
  label: input.key,
  anchorId: input.blockId,
  kind: 'document_link_definition',
  linkKey: input.key,
  definitionKey: input.definitionKey ?? input.key,
  linkText: input.text,
  linkMode: input.mode,
  sourceDocumentId: input.documentId,
  sourceBlockId: input.blockId,
  sourceGroupId: input.sourceGroupId ?? null,
  sourceGroupSlug: input.sourceGroupSlug ?? null,
});

export const createDocumentLinkUsageReference = (input: {
  entityId: EntityId;
  key: string;
  definitionKey: string;
  mode: DocumentLinkMode;
  text: string;
  sourceDocumentId: DocumentId;
  sourceBlockId: string | null;
  sourceGroupId?: GroupId | null;
  sourceGroupSlug?: string | null;
}): DocumentEntityReference => ({
  entityId: input.entityId,
  label: input.key,
  anchorId: input.sourceBlockId,
  kind: 'document_link_usage',
  linkKey: input.key,
  definitionKey: input.definitionKey,
  linkText: input.text,
  linkMode: input.mode,
  sourceDocumentId: input.sourceDocumentId,
  sourceBlockId: input.sourceBlockId,
  sourceGroupId: input.sourceGroupId ?? null,
  sourceGroupSlug: input.sourceGroupSlug ?? null,
});

export const buildDocumentLinkDefinitionIndex = (
  documents: Array<Pick<DocumentRecord, 'id' | 'entityId' | 'groupId' | 'title' | 'body'>>,
) => {
  const definitions = new Map<string, DocumentLinkDefinition>();

  for (const definition of collectDocumentLinkDefinitions(documents)) {
    definitions.set(definition.definitionKey, {
      ...definition,
      key: definition.definitionKey,
    });
  }

  return definitions;
};

export const buildCrossSubspaceDocumentLinkDefinitions = (
  documents: Array<Pick<DocumentRecord, 'id' | 'entityId' | 'groupId' | 'title' | 'body'>>,
  input: {
    currentGroupId: GroupId | null;
    groupSlugById: Map<string, string>;
  },
) => {
  const definitions = new Map<string, DocumentLinkDefinition>();

  for (const definition of collectDocumentLinkDefinitions(documents, input.groupSlugById)) {
    const isCurrentContext = definition.sourceGroupId === input.currentGroupId;
    const qualifier = getDocumentLinkQualifierForGroup(definition.sourceGroupSlug);
    const qualifiedKey = buildQualifiedDocumentLinkKey(qualifier, definition.definitionKey);
    const availableKeys = isCurrentContext ? [definition.definitionKey, qualifiedKey] : [qualifiedKey];

    for (const key of availableKeys) {
      if (!definitions.has(key)) {
        definitions.set(key, {
          ...definition,
          key,
        });
      }
    }
  }

  return Array.from(definitions.values());
};

const collectDocumentLinkDefinitions = (
  documents: Array<Pick<DocumentRecord, 'id' | 'entityId' | 'groupId' | 'title' | 'body'>>,
  groupSlugById: Map<string, string> = new Map(),
) => {
  const definitions = new Map<string, DocumentLinkDefinition>();

  for (const document of documents) {
    const sourceGroupId = document.groupId ?? null;
    const sourceGroupSlug =
      sourceGroupId !== null ? groupSlugById.get(sourceGroupId) ?? null : null;

    for (const block of document.body) {
      const referenceDefinitions = block.entityReferences.filter(isDocumentLinkDefinitionReference);
      const usageReferences = block.entityReferences.filter(isDocumentLinkUsageReference);
      const tokens = extractDocumentLinkTokens(block.text ?? '');

      for (const reference of referenceDefinitions) {
        if (
          !reference.definitionKey && !reference.linkKey ||
          !reference.linkMode ||
          typeof reference.linkText !== 'string'
        ) {
          continue;
        }

        const definitionKey = reference.definitionKey ?? reference.linkKey!;

        definitions.set(`${sourceGroupId ?? ROOT_DOCUMENT_LINK_QUALIFIER}:${definitionKey}`, {
          key: definitionKey,
          definitionKey,
          mode: reference.linkMode,
          text: reference.linkText,
          sourceDocumentId: reference.sourceDocumentId ?? document.id,
          sourceEntityId: document.entityId,
          sourceBlockId: reference.sourceBlockId ?? block.id,
          sourceTitle: document.title,
          sourceGroupId,
          sourceGroupSlug,
        });
      }

      if (referenceDefinitions.length > 0) {
        continue;
      }

      if (usageReferences.length > 0) {
        continue;
      }

      for (const token of tokens) {
        if (token.qualifier !== null) {
          continue;
        }

        const definitionKey = token.definitionKey;
        const definitionId = `${sourceGroupId ?? ROOT_DOCUMENT_LINK_QUALIFIER}:${definitionKey}`;

        if (definitions.has(definitionId)) {
          continue;
        }

        definitions.set(definitionId, {
          key: definitionKey,
          definitionKey,
          mode: token.mode,
          text: token.text,
          sourceDocumentId: document.id,
          sourceEntityId: document.entityId,
          sourceBlockId: block.id,
          sourceTitle: document.title,
          sourceGroupId,
          sourceGroupSlug,
        });
      }
    }
  }

  return Array.from(definitions.values());
};

export const replaceDocumentLinkTokensForPreview = (text: string) => {
  let normalized = text;

  for (const token of extractDocumentLinkTokens(text)) {
    normalized = normalized.replace(token.raw, token.text);
  }

  return normalized;
};

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

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
