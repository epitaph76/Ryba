import type {
  JsonObject,
  JsonValue,
  QueryResultColumnRecord,
  SavedQueryParameterDefinition,
  SavedQueryParameterValue,
} from '@ryba/types';

export class SavedQueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SavedQueryValidationError';
  }
}

const TEMPLATE_PARAMETER_PATTERN = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;
const FORBIDDEN_SQL_PATTERNS = [
  /\b(insert|update|delete|drop|alter|create|grant|revoke|copy|truncate|vacuum|analyze|comment|call|execute|merge|refresh|listen|notify|do|set|reset)\b/i,
  /\bpg_sleep\b/i,
  /\binto\b/i,
  /\bfor\s+update\b/i,
];

export const extractTemplateParameterNames = (sqlTemplate: string) => {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const match of sqlTemplate.matchAll(TEMPLATE_PARAMETER_PATTERN)) {
    const name = match[1];

    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }

  return names;
};

export const validateSavedQueryDefinition = (
  sqlTemplate: string,
  definitions: SavedQueryParameterDefinition[],
) => {
  const definitionNames = definitions.map((definition) => definition.name);
  const duplicateName = definitionNames.find(
    (name, index) => definitionNames.indexOf(name) !== index,
  );

  if (duplicateName) {
    throw new SavedQueryValidationError(`Duplicate parameter definition: ${duplicateName}`);
  }

  for (const definition of definitions) {
    validateDefaultValue(definition);
  }

  const templateNames = extractTemplateParameterNames(sqlTemplate);
  const templateNameSet = new Set(templateNames);
  const definitionNameSet = new Set(definitionNames);
  const missingDefinitions = templateNames.filter((name) => !definitionNameSet.has(name));
  const unusedDefinitions = definitionNames.filter((name) => !templateNameSet.has(name));

  if (missingDefinitions.length > 0) {
    throw new SavedQueryValidationError(
      `Missing parameter definitions for: ${missingDefinitions.join(', ')}`,
    );
  }

  if (unusedDefinitions.length > 0) {
    throw new SavedQueryValidationError(
      `Unused parameter definitions: ${unusedDefinitions.join(', ')}`,
    );
  }

  assertSafeSelectTemplate(sqlTemplate);
};

export const coerceSavedQueryParameterValues = (
  definitions: SavedQueryParameterDefinition[],
  rawParameters: Record<string, SavedQueryParameterValue> = {},
) => {
  const definitionsByName = new Map(definitions.map((definition) => [definition.name, definition]));
  const unknownParameters = Object.keys(rawParameters).filter((key) => !definitionsByName.has(key));

  if (unknownParameters.length > 0) {
    throw new SavedQueryValidationError(
      `Unknown query parameters: ${unknownParameters.join(', ')}`,
    );
  }

  return Object.fromEntries(
    definitions.map((definition) => {
      const rawValue =
        rawParameters[definition.name] !== undefined
          ? rawParameters[definition.name]
          : definition.defaultValue;

      return [definition.name, coerceParameterValue(definition, rawValue)];
    }),
  );
};

export const compileSavedQueryTemplate = (
  sqlTemplate: string,
  parameterValues: Record<string, SavedQueryParameterValue>,
) => {
  const sql = stripTrailingSemicolon(sqlTemplate.trim());
  const indexes = new Map<string, number>();
  const values: SavedQueryParameterValue[] = [];

  const text = sql.replace(TEMPLATE_PARAMETER_PATTERN, (_, rawName: string) => {
    const name = rawName.trim();
    const existingIndex = indexes.get(name);

    if (existingIndex) {
      return `$${existingIndex}`;
    }

    const value = parameterValues[name];

    if (value === undefined) {
      throw new SavedQueryValidationError(`Missing value for query parameter: ${name}`);
    }

    const nextIndex = values.length + 1;
    indexes.set(name, nextIndex);
    values.push(value);
    return `$${nextIndex}`;
  });

  return {
    text,
    values,
  };
};

export const mapPgTypeOidToLabel = (oid: number) => {
  const knownTypes: Record<number, string> = {
    16: 'boolean',
    20: 'int8',
    21: 'int2',
    23: 'int4',
    25: 'text',
    114: 'json',
    700: 'float4',
    701: 'float8',
    1043: 'varchar',
    1082: 'date',
    1114: 'timestamp',
    1184: 'timestamptz',
    1700: 'numeric',
    2950: 'uuid',
    3802: 'jsonb',
  };

  return knownTypes[oid] ?? `oid:${oid}`;
};

export const normalizeQueryCellValue = (value: unknown): JsonValue => {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeQueryCellValue(item));
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('base64');
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, currentValue]) => [
        key,
        normalizeQueryCellValue(currentValue),
      ]),
    );
  }

  return String(value);
};

export const buildQueryResultColumns = (labels: Array<{ label: string; dataType: string }>) => {
  const counts = new Map<string, number>();

  return labels.map<QueryResultColumnRecord>((label, index) => {
    const baseKey =
      label.label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || `column_${index + 1}`;
    const nextCount = (counts.get(baseKey) ?? 0) + 1;
    counts.set(baseKey, nextCount);

    return {
      key: nextCount === 1 ? baseKey : `${baseKey}_${nextCount}`,
      label: label.label || `Column ${index + 1}`,
      dataType: label.dataType,
    };
  });
};

export const buildQueryResultRows = (
  columns: QueryResultColumnRecord[],
  rows: unknown[][],
): JsonObject[] =>
  rows.map((row) =>
    Object.fromEntries(
      columns.map((column, index) => [
        column.key,
        normalizeQueryCellValue(row[index]),
      ]),
    ),
  );

const validateDefaultValue = (definition: SavedQueryParameterDefinition) => {
  if (definition.defaultValue === null) {
    return;
  }

  switch (definition.type) {
    case 'number':
      if (typeof definition.defaultValue !== 'number' || !Number.isFinite(definition.defaultValue)) {
        throw new SavedQueryValidationError(
          `Default value for ${definition.name} must be a finite number`,
        );
      }
      return;
    case 'boolean':
      if (typeof definition.defaultValue !== 'boolean') {
        throw new SavedQueryValidationError(
          `Default value for ${definition.name} must be a boolean`,
        );
      }
      return;
    case 'date':
      if (
        typeof definition.defaultValue !== 'string' ||
        Number.isNaN(Date.parse(definition.defaultValue))
      ) {
        throw new SavedQueryValidationError(
          `Default value for ${definition.name} must be a valid date string`,
        );
      }
      return;
    case 'text':
      if (typeof definition.defaultValue !== 'string') {
        throw new SavedQueryValidationError(
          `Default value for ${definition.name} must be a string`,
        );
      }
      return;
  }
};

const coerceParameterValue = (
  definition: SavedQueryParameterDefinition,
  rawValue: SavedQueryParameterValue | undefined,
) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    if (definition.required) {
      throw new SavedQueryValidationError(`Parameter "${definition.label}" is required`);
    }

    return null;
  }

  switch (definition.type) {
    case 'number': {
      const numericValue =
        typeof rawValue === 'number'
          ? rawValue
          : typeof rawValue === 'string'
            ? Number(rawValue)
            : Number.NaN;

      if (!Number.isFinite(numericValue)) {
        throw new SavedQueryValidationError(
          `Parameter "${definition.label}" must be a valid number`,
        );
      }

      return numericValue;
    }
    case 'boolean':
      if (typeof rawValue === 'boolean') {
        return rawValue;
      }

      if (rawValue === 'true') {
        return true;
      }

      if (rawValue === 'false') {
        return false;
      }

      throw new SavedQueryValidationError(
        `Parameter "${definition.label}" must be true or false`,
      );
    case 'date': {
      if (typeof rawValue !== 'string' || Number.isNaN(Date.parse(rawValue))) {
        throw new SavedQueryValidationError(
          `Parameter "${definition.label}" must be a valid date string`,
        );
      }

      return rawValue.trim();
    }
    case 'text':
    default: {
      const value = String(rawValue).trim();

      if (value.length === 0) {
        if (definition.required) {
          throw new SavedQueryValidationError(`Parameter "${definition.label}" is required`);
        }

        return null;
      }

      return value;
    }
  }
};

const assertSafeSelectTemplate = (sqlTemplate: string) => {
  const trimmed = sqlTemplate.trim();

  if (trimmed.length === 0) {
    throw new SavedQueryValidationError('SQL template cannot be empty');
  }

  if (trimmed.includes('$')) {
    throw new SavedQueryValidationError(
      'Use {{named_parameters}} instead of raw PostgreSQL placeholders or dollar-quoted blocks',
    );
  }

  const stripped = stripSqlLiteralsAndComments(trimmed);
  const normalized = stripTrailingSemicolon(stripped).trim().toLowerCase();

  if (normalized.includes(';')) {
    throw new SavedQueryValidationError('Only a single SQL statement is allowed');
  }

  if (!(normalized.startsWith('select ') || normalized === 'select' || normalized.startsWith('with '))) {
    throw new SavedQueryValidationError('Only SELECT queries are allowed');
  }

  for (const pattern of FORBIDDEN_SQL_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new SavedQueryValidationError('Query contains forbidden SQL constructs');
    }
  }

  const placeholderFreeSql = trimmed.replace(TEMPLATE_PARAMETER_PATTERN, '');

  if (placeholderFreeSql.includes('{{') || placeholderFreeSql.includes('}}')) {
    throw new SavedQueryValidationError('Query contains malformed parameter placeholders');
  }
};

const stripTrailingSemicolon = (value: string) => value.replace(/;\s*$/, '');

const stripSqlLiteralsAndComments = (sql: string) => {
  let index = 0;
  let mode: 'normal' | 'single_quote' | 'double_quote' | 'line_comment' | 'block_comment' = 'normal';
  let output = '';

  while (index < sql.length) {
    const current = sql[index] ?? '';
    const next = sql[index + 1] ?? '';

    if (mode === 'normal') {
      if (current === '-' && next === '-') {
        mode = 'line_comment';
        index += 2;
        output += ' ';
        continue;
      }

      if (current === '/' && next === '*') {
        mode = 'block_comment';
        index += 2;
        output += ' ';
        continue;
      }

      if (current === '\'') {
        mode = 'single_quote';
        index += 1;
        output += ' ';
        continue;
      }

      if (current === '"') {
        mode = 'double_quote';
        index += 1;
        output += ' ';
        continue;
      }

      output += current;
      index += 1;
      continue;
    }

    if (mode === 'single_quote') {
      if (current === '\'' && next === '\'') {
        index += 2;
        continue;
      }

      if (current === '\'') {
        mode = 'normal';
      }

      index += 1;
      continue;
    }

    if (mode === 'double_quote') {
      if (current === '"' && next === '"') {
        index += 2;
        continue;
      }

      if (current === '"') {
        mode = 'normal';
      }

      index += 1;
      continue;
    }

    if (mode === 'line_comment') {
      if (current === '\n') {
        mode = 'normal';
        output += '\n';
      }

      index += 1;
      continue;
    }

    if (current === '*' && next === '/') {
      mode = 'normal';
      index += 2;
      output += ' ';
      continue;
    }

    index += 1;
  }

  return output;
};
