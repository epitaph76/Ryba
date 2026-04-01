import type {
  EntityFieldType,
  EntityRecord,
  EntityTypeFieldRecord,
  EntityTypeRecord,
  JsonObject,
  JsonValue,
} from '@ryba/types';

export const FIELD_TYPE_OPTIONS: EntityFieldType[] = [
  'text',
  'rich_text',
  'number',
  'boolean',
  'date',
  'select',
  'multi_select',
  'relation',
  'user',
  'url',
  'status',
];

export type EntityDraftValue = string | boolean;

export type EntityDraft = {
  entityTypeId: string;
  title: string;
  summary: string;
  properties: Record<string, EntityDraftValue>;
};

export type EntityTypeFieldDraft = {
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

const toDisplayValue = (field: EntityTypeFieldRecord, value: JsonValue | undefined): EntityDraftValue => {
  if (field.fieldType === 'boolean') {
    return value === true;
  }

  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'number' || typeof value === 'string') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return JSON.stringify(value);
};

const parseCommaList = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const parseOptionsText = (value: string) =>
  parseCommaList(value).map((item) => ({
    value: item,
    label: item,
    color: null,
  }));

export const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

export const toFieldKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

export const getDefaultEntityTypeId = (
  entityTypes: EntityTypeRecord[],
  preferredEntityTypeId?: string | null,
) => {
  if (preferredEntityTypeId && entityTypes.some((entityType) => entityType.id === preferredEntityTypeId)) {
    return preferredEntityTypeId;
  }

  return entityTypes.find((entityType) => entityType.slug === 'note')?.id ?? entityTypes[0]?.id ?? '';
};

export const createEntityDraft = (
  entity: EntityRecord | null,
  entityType: EntityTypeRecord | null,
  entityTypes: EntityTypeRecord[],
): EntityDraft => {
  const draftProperties: Record<string, EntityDraftValue> = {};

  for (const field of entityType?.fields ?? []) {
    draftProperties[field.key] = toDisplayValue(field, entity?.properties[field.key]);
  }

  return {
    entityTypeId: getDefaultEntityTypeId(entityTypes, entity?.entityTypeId),
    title: entity?.title ?? '',
    summary: entity?.summary ?? '',
    properties: draftProperties,
  };
};

export const createEmptyFieldDraft = (): EntityTypeFieldDraft => ({
  key: '',
  label: '',
  fieldType: 'text',
  description: '',
  required: false,
  optionsText: '',
  allowMultiple: false,
  relationEntityTypeId: '',
});

export const createEntityTypeDraft = (entityType?: EntityTypeRecord | null): EntityTypeDraft => ({
  name: entityType?.name ?? '',
  slug: entityType?.slug ?? '',
  description: entityType?.description ?? '',
  color: entityType?.color ?? '',
  icon: entityType?.icon ?? '',
  fields:
    entityType?.fields.map((field) => ({
      key: field.key,
      label: field.label,
      fieldType: field.fieldType,
      description: field.description ?? '',
      required: field.required,
      optionsText: Array.isArray(field.config.options)
        ? field.config.options
            .map((option) =>
              typeof option === 'object' && option && 'value' in option ? String(option.value) : '',
            )
            .filter(Boolean)
            .join(', ')
        : '',
      allowMultiple: field.config.allowMultiple === true,
      relationEntityTypeId:
        typeof field.config.relationEntityTypeId === 'string' ? field.config.relationEntityTypeId : '',
    })) ?? [],
});

export const buildEntityUpdateInput = (
  draft: EntityDraft,
  entityType: EntityTypeRecord | null,
): {
  entityTypeId: string | null;
  title: string;
  summary: string | null;
  properties: JsonObject;
} => {
  const properties: JsonObject = {};

  for (const field of entityType?.fields ?? []) {
    const rawValue = draft.properties[field.key];

    if (field.fieldType === 'boolean') {
      properties[field.key] = rawValue === true;

      continue;
    }

    const stringValue = typeof rawValue === 'string' ? rawValue.trim() : '';

    if (!stringValue) {
      continue;
    }

    if (
      field.fieldType === 'text' ||
      field.fieldType === 'rich_text' ||
      field.fieldType === 'date' ||
      field.fieldType === 'select' ||
      field.fieldType === 'status' ||
      field.fieldType === 'url'
    ) {
      properties[field.key] = stringValue;
      continue;
    }

    if (field.fieldType === 'number') {
      const parsed = Number(stringValue);

      if (!Number.isFinite(parsed)) {
        throw new Error(`${field.label} must be a valid number`);
      }

      properties[field.key] = parsed;
      continue;
    }

    if (field.fieldType === 'multi_select') {
      properties[field.key] = parseCommaList(stringValue);
      continue;
    }

    if (field.fieldType === 'relation' || field.fieldType === 'user') {
      properties[field.key] =
        field.config.allowMultiple === true ? parseCommaList(stringValue) : stringValue;
    }
  }

  return {
    entityTypeId: draft.entityTypeId || null,
    title: draft.title.trim(),
    summary: draft.summary.trim() ? draft.summary.trim() : null,
    properties,
  };
};

export const buildEntityTypeInput = (draft: EntityTypeDraft) => ({
  name: draft.name.trim(),
  slug: toSlug(draft.slug || draft.name),
  description: draft.description.trim() ? draft.description.trim() : null,
  color: draft.color.trim() ? draft.color.trim() : null,
  icon: draft.icon.trim() ? draft.icon.trim() : null,
  fields: draft.fields
    .filter((field) => field.label.trim() && field.key.trim())
    .map((field) => ({
      key: toFieldKey(field.key || field.label),
      label: field.label.trim(),
      fieldType: field.fieldType,
      description: field.description.trim() ? field.description.trim() : null,
      required: field.required,
      config: {
        ...(field.optionsText.trim() ? { options: parseOptionsText(field.optionsText) } : {}),
        ...(field.allowMultiple ? { allowMultiple: true } : {}),
        ...(field.relationEntityTypeId.trim()
          ? { relationEntityTypeId: field.relationEntityTypeId.trim() }
          : {}),
      },
    })),
});

export const findEntityType = (
  entityTypes: EntityTypeRecord[],
  entityTypeId: string | null | undefined,
) => entityTypes.find((entityType) => entityType.id === entityTypeId) ?? null;

export const getEntityTypeName = (
  entityTypes: EntityTypeRecord[],
  entityTypeId: string | null | undefined,
) => findEntityType(entityTypes, entityTypeId)?.name ?? 'Untyped';
