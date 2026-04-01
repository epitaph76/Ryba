import type {
  EntityFieldOption,
  EntityFieldType,
  EntityTypeFieldRecord,
  JsonObject,
  JsonValue,
} from '@ryba/types';

export class EntityValidationError extends Error {}

const textLikeFieldTypes = new Set<EntityFieldType>([
  'text',
  'rich_text',
  'select',
  'status',
  'url',
]);

const isJsonObject = (value: unknown): value is JsonObject =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const normalizeString = (value: unknown, label: string): string => {
  if (typeof value !== 'string') {
    throw new EntityValidationError(`${label} must be a string`);
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new EntityValidationError(`${label} must not be empty`);
  }

  return normalized;
};

const normalizeOptions = (value: unknown): EntityFieldOption[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const options: EntityFieldOption[] = [];

  for (const item of value) {
    if (!isJsonObject(item)) {
      throw new EntityValidationError('Field options must be objects');
    }

    const optionValue = normalizeString(item.value, 'Option value');
    const optionLabel = normalizeString(item.label ?? item.value, 'Option label');

    if (seen.has(optionValue)) {
      throw new EntityValidationError(`Duplicate field option "${optionValue}"`);
    }

    seen.add(optionValue);
    options.push({
      value: optionValue,
      label: optionLabel,
      color: typeof item.color === 'string' && item.color.trim() ? item.color.trim() : null,
    });
  }

  return options;
};

const requireAllowedOption = (
  value: string,
  options: EntityFieldOption[],
  fieldLabel: string,
) => {
  if (options.length === 0) {
    return;
  }

  if (!options.some((option) => option.value === value)) {
    throw new EntityValidationError(`${fieldLabel} must use one of the configured options`);
  }
};

const normalizeStringList = (value: unknown, fieldLabel: string): string[] => {
  if (!Array.isArray(value)) {
    throw new EntityValidationError(`${fieldLabel} must be an array of strings`);
  }

  return value.map((item) => normalizeString(item, fieldLabel));
};

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
};

export const normalizeFieldConfig = (
  fieldType: EntityFieldType,
  rawConfig: unknown,
): JsonObject => {
  const config = isJsonObject(rawConfig) ? rawConfig : {};
  const normalized: JsonObject = {};
  const options = normalizeOptions(config.options);

  if (options.length > 0) {
    normalized.options = options.map((option) => ({
      value: option.value,
      label: option.label,
      color: option.color,
    }));
  }

  const placeholder = normalizeOptionalString(config.placeholder);

  if (placeholder) {
    normalized.placeholder = placeholder;
  }

  if (
    fieldType === 'relation' ||
    fieldType === 'user' ||
    fieldType === 'multi_select'
  ) {
    normalized.allowMultiple = config.allowMultiple === true;
  }

  if (fieldType === 'relation') {
    normalized.relationEntityTypeId =
      typeof config.relationEntityTypeId === 'string' && config.relationEntityTypeId.trim()
        ? config.relationEntityTypeId.trim()
        : null;
  }

  return normalized;
};

export const normalizeEntityProperties = (
  fields: EntityTypeFieldRecord[],
  rawProperties: unknown,
): JsonObject => {
  const properties = isJsonObject(rawProperties) ? rawProperties : {};
  const normalized: JsonObject = {};

  for (const field of fields) {
    const rawValue = properties[field.key];
    const label = field.label;
    const config = field.config;
    const options = Array.isArray(config.options) ? normalizeOptions(config.options) : [];
    const allowMultiple = config.allowMultiple === true;

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      if (field.required) {
        throw new EntityValidationError(`${label} is required`);
      }

      continue;
    }

    if (textLikeFieldTypes.has(field.fieldType)) {
      const value = normalizeString(rawValue, label);

      if (field.fieldType === 'url') {
        try {
          new URL(value);
        } catch {
          throw new EntityValidationError(`${label} must be a valid URL`);
        }
      }

      if (field.fieldType === 'select' || field.fieldType === 'status') {
        requireAllowedOption(value, options, label);
      }

      normalized[field.key] = value;
      continue;
    }

    if (field.fieldType === 'number') {
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
        throw new EntityValidationError(`${label} must be a finite number`);
      }

      normalized[field.key] = rawValue;
      continue;
    }

    if (field.fieldType === 'boolean') {
      if (typeof rawValue !== 'boolean') {
        throw new EntityValidationError(`${label} must be true or false`);
      }

      normalized[field.key] = rawValue;
      continue;
    }

    if (field.fieldType === 'date') {
      const value = normalizeString(rawValue, label);

      if (Number.isNaN(Date.parse(value))) {
        throw new EntityValidationError(`${label} must be a valid date`);
      }

      normalized[field.key] = value;
      continue;
    }

    if (field.fieldType === 'multi_select') {
      const values = normalizeStringList(rawValue, label);

      for (const value of values) {
        requireAllowedOption(value, options, label);
      }

      normalized[field.key] = values;
      continue;
    }

    if (field.fieldType === 'relation' || field.fieldType === 'user') {
      if (allowMultiple) {
        normalized[field.key] = normalizeStringList(rawValue, label);
        continue;
      }

      normalized[field.key] = normalizeString(rawValue, label);
      continue;
    }
  }

  return normalized;
};

export const normalizeFieldValueForView = (
  field: EntityTypeFieldRecord,
  value: JsonValue | undefined,
): string => {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number' || typeof value === 'string') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return JSON.stringify(value);
};
