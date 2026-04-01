import type { DocumentBlock, DocumentDetailRecord, EntityRecord } from '@ryba/types';

import { buildDocumentDraft, type DocumentDraft } from './document-model';

export const ENTITY_DOCUMENT_ANCHOR_ID = 'entity-document-root';
const ENTITY_DOCUMENT_BLOCK_ID = 'entity-document-root-block';

export const isEntityDocumentReference = (
  entityId: string,
  reference: { entityId: string; anchorId: string | null },
) => reference.entityId === entityId && reference.anchorId === ENTITY_DOCUMENT_ANCHOR_ID;

export const isEntityDocumentBlock = (entityId: string, block: DocumentBlock) =>
  block.entityReferences.some((reference) => isEntityDocumentReference(entityId, reference));

export const stripEntityDocumentMarker = (entityId: string, body: DocumentBlock[]) =>
  body.filter((block) => !isEntityDocumentBlock(entityId, block));

export const buildEntityDocumentDraft = (
  entity: Pick<EntityRecord, 'id' | 'title'>,
  detail: Pick<DocumentDetailRecord, 'document'> | null,
): DocumentDraft => {
  if (!detail) {
    return {
      title: entity.title,
      body: [],
    };
  }

  const draft = buildDocumentDraft(detail.document);

  return {
    title: draft.title || entity.title,
    body: stripEntityDocumentMarker(entity.id, draft.body),
  };
};

export const buildEntityDocumentPayload = (
  entity: Pick<EntityRecord, 'id' | 'title'>,
  draft: DocumentDraft,
) => ({
  title: draft.title.trim() || entity.title,
  body: [
    {
      id: ENTITY_DOCUMENT_BLOCK_ID,
      kind: 'entity_reference' as const,
      text: null,
      entityReferences: [
        {
          entityId: entity.id,
          label: entity.title,
          anchorId: ENTITY_DOCUMENT_ANCHOR_ID,
        },
      ],
    },
    ...stripEntityDocumentMarker(entity.id, draft.body),
  ],
});

export const getEntityDocumentOwnerEntityId = (
  detail: Pick<DocumentDetailRecord, 'document' | 'mentions'>,
) =>
  detail.mentions.find((reference) => reference.anchorId === ENTITY_DOCUMENT_ANCHOR_ID)?.entityId ??
  detail.document.body
    .flatMap((block) => block.entityReferences)
    .find((reference) => reference.anchorId === ENTITY_DOCUMENT_ANCHOR_ID)?.entityId ??
  null;

export const isEntityOwnedDocument = (
  detail: Pick<DocumentDetailRecord, 'document' | 'mentions'>,
  entityId: string,
) => getEntityDocumentOwnerEntityId(detail) === entityId;
