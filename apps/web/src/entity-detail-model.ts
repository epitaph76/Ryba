import type {
  EntityFieldType,
  EntityTypeFieldRecord,
  EntityTypeRecord,
  EntityRecord,
  JsonObject,
} from '@ryba/types';

import {
  getFieldOptions,
  normalizeFieldValue,
  serializeFieldValue,
  type FieldEditorValue,
} from './field-renderers';

export type EntityDetailDraft = {
  entityTypeId: string | null;
  title: string;
  summary: string;
  properties: Record<string, FieldEditorValue>;
};

export type EntityTypeFieldDraft = {
  id?: string;
  key: string;
  label: string;
  fieldType: EntityFieldType;
  description: string;
  required: boolean;
  optionsText: string;
  allowMultiple: boolean;
  relationEntityTypeId: string;
};

export type EntityTypeDraft = {
  name: string;
  slug: string;
  description: string;
  color: string;
  icon: string;
  fields: EntityTypeFieldDraft[];
};

export const DEFAULT_FIELD_TYPE: EntityFieldType = 'text';

const emptyString = (value: string) => value.trim() === '';

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function fieldKeyify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, 64);
}

export function getEntityTypeById(
  entityTypes: EntityTypeRecord[],
  entityTypeId: string | null | undefined,
): EntityTypeRecord | null {
  if (!entityTypeId) {
    return null;
  }

  return entityTypes.find((entityType) => entityType.id === entityTypeId) ?? null;
}

export function buildEntityDetailDraft(
  entity: EntityRecord | null,
  entityTypes: EntityTypeRecord[],
): EntityDetailDraft | null {
  if (!entity) {
    return null;
  }

  const entityType = getEntityTypeById(entityTypes, entity.entityTypeId);
  const properties: Record<string, FieldEditorValue> = {};

  for (const field of entityType?.fields ?? []) {
    properties[field.key] = normalizeFieldValue(field, entity.properties[field.key]);
  }

  return {
    entityTypeId: entity.entityTypeId,
    title: entity.title,
    summary: entity.summary ?? '',
    properties,
  };
}

export function buildDraftPropertiesForType(
  entityType: EntityTypeRecord | null,
  rawProperties: JsonObject,
): Record<string, FieldEditorValue> {
  const properties: Record<string, FieldEditorValue> = {};

  for (const field of entityType?.fields ?? []) {
    properties[field.key] = normalizeFieldValue(field, rawProperties[field.key]);
  }

  return properties;
}

export function buildEntityUpdatePayload(
  draft: EntityDetailDraft,
  entityTypes: EntityTypeRecord[],
): {
  entityTypeId: string | null;
  title: string;
  summary: string | null;
  properties: JsonObject;
} {
  const entityType = getEntityTypeById(entityTypes, draft.entityTypeId);
  const properties: JsonObject = {};

  for (const field of entityType?.fields ?? []) {
    const serialized = serializeFieldValue(field, draft.properties[field.key] ?? '');

    if (serialized !== undefined) {
      properties[field.key] = serialized;
    }
  }

  return {
    entityTypeId: draft.entityTypeId,
    title: draft.title.trim(),
    summary: emptyString(draft.summary) ? null : draft.summary.trim(),
    properties,
  };
}

export function buildEntityTypeDraft(entityType: EntityTypeRecord | null): EntityTypeDraft {
  if (!entityType) {
    return createEmptyEntityTypeDraft();
  }

  return {
    name: entityType.name,
    slug: entityType.slug,
    description: entityType.description ?? '',
    color: entityType.color ?? '',
    icon: entityType.icon ?? '',
    fields: entityType.fields
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((field) => ({
        id: field.id,
        key: field.key,
        label: field.label,
        fieldType: field.fieldType,
        description: field.description ?? '',
        required: field.required,
        optionsText: getFieldOptions(field)
          .map((option) => option.value)
          .join(', '),
        allowMultiple: field.config.allowMultiple === true,
        relationEntityTypeId:
          typeof field.config.relationEntityTypeId === 'string'
            ? field.config.relationEntityTypeId
            : '',
      })),
  };
}

export function createEmptyEntityTypeDraft(): EntityTypeDraft {
  return {
    name: '',
    slug: '',
    description: '',
    color: '',
    icon: '',
    fields: [],
  };
}

export function createEmptyFieldDraft(): EntityTypeFieldDraft {
  return {
    key: '',
    label: '',
    fieldType: DEFAULT_FIELD_TYPE,
    description: '',
    required: false,
    optionsText: '',
    allowMultiple: false,
    relationEntityTypeId: '',
  };
}

export function serializeEntityTypeDraft(draft: EntityTypeDraft) {
  return {
    name: draft.name.trim(),
    slug: slugify(draft.slug || draft.name),
    description: emptyString(draft.description) ? null : draft.description.trim(),
    color: emptyString(draft.color) ? null : draft.color.trim(),
    icon: emptyString(draft.icon) ? null : draft.icon.trim(),
    fields: draft.fields
      .filter((field) => !emptyString(field.key) && !emptyString(field.label))
      .map((field, index) => ({
        ...(field.id ? { id: field.id } : {}),
        key: fieldKeyify(field.key || field.label),
        label: field.label.trim(),
        fieldType: field.fieldType,
        description: emptyString(field.description) ? null : field.description.trim(),
        required: field.required,
        order: index,
        config: buildFieldConfig(field),
      })),
  };
}

function buildFieldConfig(field: EntityTypeFieldDraft): JsonObject {
  const config: JsonObject = {};

  const options = field.optionsText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((value) => ({
      value,
      label: value,
      color: null,
    }));

  if (options.length > 0) {
    config.options = options;
  }

  if (field.allowMultiple) {
    config.allowMultiple = true;
  }

  if (!emptyString(field.relationEntityTypeId)) {
    config.relationEntityTypeId = field.relationEntityTypeId.trim();
  }

  return config;
}
