import * as documentLinkRuntime from '@ryba/types';

export const ROOT_DOCUMENT_LINK_QUALIFIER = documentLinkRuntime.ROOT_DOCUMENT_LINK_QUALIFIER;
export const buildCrossSubspaceDocumentLinkDefinitions =
  documentLinkRuntime.buildCrossSubspaceDocumentLinkDefinitions;
export const buildDocumentLinkDefinitionIndex =
  documentLinkRuntime.buildDocumentLinkDefinitionIndex;
export const buildDocumentLinkToken = documentLinkRuntime.buildDocumentLinkToken;
export const buildQualifiedDocumentLinkKey = documentLinkRuntime.buildQualifiedDocumentLinkKey;
export const collectUsageReferencesByBlockId = documentLinkRuntime.collectUsageReferencesByBlockId;
export const createDocumentLinkDefinitionReference =
  documentLinkRuntime.createDocumentLinkDefinitionReference;
export const createDocumentLinkUsageReference =
  documentLinkRuntime.createDocumentLinkUsageReference;
export const escapeRegExp = documentLinkRuntime.escapeRegExp;
export const extractDocumentLinkTokens = documentLinkRuntime.extractDocumentLinkTokens;
export const getDocumentLinkQualifierForGroup =
  documentLinkRuntime.getDocumentLinkQualifierForGroup;
export const isDocumentLinkDefinitionReference =
  documentLinkRuntime.isDocumentLinkDefinitionReference;
export const isDocumentLinkUsageReference = documentLinkRuntime.isDocumentLinkUsageReference;
export const isQualifiedDocumentLinkKey = documentLinkRuntime.isQualifiedDocumentLinkKey;
export const parseDocumentLinkKey = documentLinkRuntime.parseDocumentLinkKey;
export const replaceDocumentLinkTokensForPreview =
  documentLinkRuntime.replaceDocumentLinkTokensForPreview;
export type { DocumentLinkToken } from '@ryba/types';
