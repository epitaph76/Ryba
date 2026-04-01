import type {
  EntityFieldOption,
  EntityTypeFieldRecord,
  EntityRecord,
  JsonObject,
  JsonValue,
  UserRecord,
} from '@ryba/types';

export type FieldEditorValue = string | string[] | boolean;

type FieldFormatContext = {
  entities?: EntityRecord[];
  currentUser?: UserRecord | null;
};

const isJsonObject = (value: unknown): value is JsonObject =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isEntityFieldOptionLike = (
  value: JsonValue,
): value is JsonObject & { value: string; label?: string; color?: string | null } =>
  isJsonObject(value) && typeof value.value === 'string';

const trimString = (value: string) => value.trim();

export function getFieldOptions(field: EntityTypeFieldRecord): EntityFieldOption[] {
  const rawOptions = isJsonObject(field.config) ? field.config.options : undefined;

  if (!Array.isArray(rawOptions)) {
    return [];
  }

  return rawOptions
    .filter(isEntityFieldOptionLike)
    .map((option) => ({
      value: trimString(option.value),
      label:
        typeof option.label === 'string' && trimString(option.label)
          ? trimString(option.label)
          : trimString(option.value),
      color:
        typeof option.color === 'string' && trimString(option.color)
          ? trimString(option.color)
          : null,
    }))
    .filter((option) => option.value.length > 0);
}

export function fieldAllowsMultiple(field: EntityTypeFieldRecord): boolean {
  if (field.fieldType === 'multi_select') {
    return true;
  }

  return field.config.allowMultiple === true;
}

export function normalizeFieldValue(
  field: EntityTypeFieldRecord,
  rawValue: JsonValue | undefined,
): FieldEditorValue {
  if (field.fieldType === 'boolean') {
    return rawValue === true;
  }

  if (field.fieldType === 'multi_select') {
    return Array.isArray(rawValue)
      ? rawValue
          .map((value) => (typeof value === 'string' ? trimString(value) : ''))
          .filter(Boolean)
      : [];
  }

  if ((field.fieldType === 'relation' || field.fieldType === 'user') && fieldAllowsMultiple(field)) {
    return Array.isArray(rawValue)
      ? rawValue
          .map((value) => (typeof value === 'string' ? trimString(value) : ''))
          .filter(Boolean)
      : [];
  }

  if (field.fieldType === 'number') {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      return String(rawValue);
    }

    if (typeof rawValue === 'string') {
      return trimString(rawValue);
    }

    return '';
  }

  if (typeof rawValue === 'string') {
    return rawValue;
  }

  return '';
}

export function serializeFieldValue(
  field: EntityTypeFieldRecord,
  value: FieldEditorValue,
): JsonValue | undefined {
  if (field.fieldType === 'boolean') {
    return value === true;
  }

  if (field.fieldType === 'multi_select') {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const normalized = value.map(trimString).filter(Boolean);
    return normalized.length > 0 ? normalized : undefined;
  }

  if ((field.fieldType === 'relation' || field.fieldType === 'user') && fieldAllowsMultiple(field)) {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const normalized = value.map(trimString).filter(Boolean);
    return normalized.length > 0 ? normalized : undefined;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = trimString(value);

  if (!normalized) {
    return undefined;
  }

  if (field.fieldType === 'number') {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : normalized;
  }

  return normalized;
}

export function formatFieldValue(
  field: EntityTypeFieldRecord,
  value: JsonValue | undefined,
  context: FieldFormatContext = {},
): string {
  if (value === undefined || value === null) {
    return 'Not set';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => formatFieldValue(field, item, context))
      .filter((item) => item !== 'Not set')
      .join(', ');
  }

  if (typeof value !== 'string') {
    return 'Not set';
  }

  if (field.fieldType === 'relation') {
    const relatedEntity = context.entities?.find((entity) => entity.id === value);
    return relatedEntity ? relatedEntity.title : value;
  }

  if (field.fieldType === 'user' && context.currentUser && context.currentUser.id === value) {
    return context.currentUser.displayName ?? context.currentUser.email;
  }

  const matchingOption = getFieldOptions(field).find((option) => option.value === value);
  return matchingOption?.label ?? value;
}
