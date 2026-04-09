import type {
  QueryRunRecord,
  SavedQueryParameterDefinition,
  SavedQueryParameterType,
  SavedQueryParameterValue,
  SavedQueryRecord,
} from '@ryba/types';

export type SavedQueryParameterDraft = {
  name: string;
  label: string;
  type: SavedQueryParameterType;
  required: boolean;
  description: string;
  defaultValue: string;
};

export type SavedQueryEditorDraft = {
  name: string;
  description: string;
  dataSourceId: string;
  sqlTemplate: string;
  parameterDefinitions: SavedQueryParameterDraft[];
};

export type SavedQueryExecutionDraft = Record<string, string>;

export const createEmptySavedQueryEditorDraft = (
  dataSourceId = '',
): SavedQueryEditorDraft => ({
  name: '',
  description: '',
  dataSourceId,
  sqlTemplate: '',
  parameterDefinitions: [],
});

export const createEmptySavedQueryParameterDraft = (): SavedQueryParameterDraft => ({
  name: '',
  label: '',
  type: 'text',
  required: false,
  description: '',
  defaultValue: '',
});

export const buildSavedQueryEditorDraft = (
  query: SavedQueryRecord | null,
  fallbackDataSourceId = '',
): SavedQueryEditorDraft => {
  if (!query) {
    return createEmptySavedQueryEditorDraft(fallbackDataSourceId);
  }

  return {
    name: query.name,
    description: query.description ?? '',
    dataSourceId: query.dataSourceId,
    sqlTemplate: query.sqlTemplate,
    parameterDefinitions: query.parameterDefinitions.map((definition) => ({
      name: definition.name,
      label: definition.label,
      type: definition.type,
      required: definition.required,
      description: definition.description ?? '',
      defaultValue: formatSavedQueryParameterValue(definition.defaultValue),
    })),
  };
};

export const serializeSavedQueryEditorDraft = (draft: SavedQueryEditorDraft) => ({
  name: draft.name.trim(),
  description: draft.description.trim() ? draft.description.trim() : null,
  dataSourceId: draft.dataSourceId,
  sqlTemplate: draft.sqlTemplate.trim(),
  parameterDefinitions: draft.parameterDefinitions.map((definition) => ({
    name: definition.name.trim(),
    label: definition.label.trim() || definition.name.trim(),
    type: definition.type,
    required: definition.required,
    description: definition.description.trim() ? definition.description.trim() : null,
    defaultValue: parseSavedQueryParameterValue(definition.type, definition.defaultValue),
  })),
});

export const buildSavedQueryExecutionDraft = (
  query: SavedQueryRecord | null,
): SavedQueryExecutionDraft =>
  Object.fromEntries(
    (query?.parameterDefinitions ?? []).map((definition) => [
      definition.name,
      formatSavedQueryParameterValue(definition.defaultValue),
    ]),
  );

export const serializeSavedQueryExecutionInput = (
  query: SavedQueryRecord,
  draft: SavedQueryExecutionDraft,
) => ({
  parameters: Object.fromEntries(
    query.parameterDefinitions.map((definition) => [
      definition.name,
      parseSavedQueryParameterValue(definition.type, draft[definition.name] ?? ''),
    ]),
  ),
});

export const formatDatasetCellValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return 'Empty';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
};

export const buildQueryRunSummary = (run: QueryRunRecord | null) => {
  if (!run) {
    return 'No query run selected yet.';
  }

  if (run.status === 'failed') {
    return run.errorMessage ?? 'Query run failed.';
  }

  return run.truncated
    ? `Showing ${run.rowCount} rows within the current limit.`
    : `${run.rowCount} rows returned.`;
};

const formatSavedQueryParameterValue = (value: SavedQueryParameterValue) => {
  if (value === null) {
    return '';
  }

  return String(value);
};

const parseSavedQueryParameterValue = (
  type: SavedQueryParameterType,
  value: string,
): SavedQueryParameterValue => {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  switch (type) {
    case 'number': {
      const numericValue = Number(trimmed);

      if (!Number.isFinite(numericValue)) {
        throw new Error(`Parameter default "${trimmed}" is not a valid number.`);
      }

      return numericValue;
    }
    case 'boolean':
      if (trimmed === 'true') {
        return true;
      }

      if (trimmed === 'false') {
        return false;
      }

      throw new Error(`Parameter default "${trimmed}" must be true or false.`);
    case 'date':
    case 'text':
    default:
      return trimmed;
  }
};
