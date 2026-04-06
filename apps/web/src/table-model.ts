import type {
  EntityFieldOption,
  EntityRecord,
  EntityTypeFieldRecord,
  EntityTypeRecord,
  JsonValue,
  SavedViewColumnConfig,
  SavedViewConfig,
  SavedViewFieldSource,
  SavedViewFilterConfig,
  SavedViewFilterOperator,
  SavedViewMode,
  SavedViewRecord,
  SavedViewSortConfig,
  UserRecord,
} from '@ryba/types';

import { formatFieldValue, getFieldOptions } from './field-renderers';

export type StructuredFieldDefinition = {
  key: string;
  label: string;
  source: SavedViewFieldSource;
  fieldType: EntityTypeFieldRecord['fieldType'] | 'system';
  options: EntityFieldOption[];
};

export type StructuredViewDraft = {
  name: string;
  description: string;
  entityTypeId: string | null;
  viewType: SavedViewMode;
  config: SavedViewConfig;
};

export const createDefaultTableDraft = (
  entityTypes: EntityTypeRecord[],
  viewType: SavedViewMode = 'table',
) => createStructuredViewDraft(entityTypes, null, viewType);

export type StructuredRow = {
  entity: EntityRecord;
  entityType: EntityTypeRecord | null;
  cells: Record<string, { rawValue: JsonValue | undefined; displayValue: string }>;
};

const SYSTEM_FIELDS: StructuredFieldDefinition[] = [
  {
    key: 'id',
    label: 'ID',
    source: 'system',
    fieldType: 'system',
    options: [],
  },
  {
    key: 'title',
    label: 'Заголовок',
    source: 'system',
    fieldType: 'system',
    options: [],
  },
  {
    key: 'summary',
    label: 'Описание',
    source: 'system',
    fieldType: 'system',
    options: [],
  },
  {
    key: 'createdAt',
    label: 'Создано',
    source: 'system',
    fieldType: 'date',
    options: [],
  },
  {
    key: 'updatedAt',
    label: 'Обновлено',
    source: 'system',
    fieldType: 'date',
    options: [],
  },
];

const DEFAULT_VISIBLE_SYSTEM_COLUMNS = new Set(['title', 'updatedAt', 'summary']);

const toColumnId = (source: SavedViewFieldSource, key: string) => `${source}:${key}`;

const findEntityType = (entityTypes: EntityTypeRecord[], entityTypeId: string | null) =>
  entityTypes.find((entityType) => entityType.id === entityTypeId) ?? null;

const normalizeString = (value: string) => value.trim().toLowerCase();

const isEmptyValue = (value: JsonValue | undefined): boolean => {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
};

const valueToComparable = (value: JsonValue | undefined): string | number | boolean | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);

    if (value.trim() !== '' && Number.isFinite(numeric)) {
      return numeric;
    }

    const timestamp = Date.parse(value);

    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }

    return normalizeString(value);
  }

  if (Array.isArray(value)) {
    return normalizeString(value.join(', '));
  }

  return JSON.stringify(value);
};

const valueToSearchText = (value: JsonValue | undefined): string => {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return normalizeString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).toLowerCase();
  }

  if (Array.isArray(value)) {
    return normalizeString(value.join(' '));
  }

  return normalizeString(JSON.stringify(value));
};

const matchesFilter = (value: JsonValue | undefined, filter: SavedViewFilterConfig): boolean => {
  if (filter.operator === 'is_empty') {
    return isEmptyValue(value);
  }

  if (filter.operator === 'is_not_empty') {
    return !isEmptyValue(value);
  }

  if (isEmptyValue(value)) {
    return false;
  }

  if (filter.operator === 'contains') {
    return valueToSearchText(value).includes(valueToSearchText(filter.value));
  }

  if (filter.operator === 'equals') {
    if (Array.isArray(value) && typeof filter.value === 'string') {
      const expectedValue = filter.value;

      return value.some((item) => normalizeString(String(item)) === normalizeString(expectedValue));
    }

    return valueToComparable(value) === valueToComparable(filter.value);
  }

  if (filter.operator === 'not_equals') {
    return !matchesFilter(value, { ...filter, operator: 'equals' });
  }

  const left = valueToComparable(value);
  const right = valueToComparable(filter.value);

  if (left === null || right === null) {
    return false;
  }

  if (filter.operator === 'gt') {
    return left > right;
  }

  if (filter.operator === 'gte') {
    return left >= right;
  }

  if (filter.operator === 'lt') {
    return left < right;
  }

  return left <= right;
};

const compareValues = (
  left: JsonValue | undefined,
  right: JsonValue | undefined,
  direction: SavedViewSortConfig['direction'],
) => {
  const leftComparable = valueToComparable(left);
  const rightComparable = valueToComparable(right);

  if (leftComparable === rightComparable) {
    return 0;
  }

  if (leftComparable === null) {
    return direction === 'asc' ? 1 : -1;
  }

  if (rightComparable === null) {
    return direction === 'asc' ? -1 : 1;
  }

  if (leftComparable > rightComparable) {
    return direction === 'asc' ? 1 : -1;
  }

  return direction === 'asc' ? -1 : 1;
};

const getFieldValue = (
  entity: EntityRecord,
  field: Pick<StructuredFieldDefinition, 'source' | 'key'>,
): JsonValue | undefined => {
  if (field.source === 'system') {
    switch (field.key) {
      case 'id':
        return entity.id;
      case 'title':
        return entity.title;
      case 'summary':
        return entity.summary;
      case 'createdAt':
        return entity.createdAt;
      case 'updatedAt':
        return entity.updatedAt;
      default:
        return undefined;
    }
  }

  return entity.properties[field.key];
};

const filterToAvailableField = (
  fields: StructuredFieldDefinition[],
  target: Pick<SavedViewFilterConfig, 'key' | 'source'>,
) => fields.some((field) => field.key === target.key && field.source === target.source);

export function buildStructuredFields(
  entityTypes: EntityTypeRecord[],
  entityTypeId: string | null,
): StructuredFieldDefinition[] {
  const entityType = findEntityType(entityTypes, entityTypeId);
  const propertyFields = (entityType?.fields ?? [])
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((field) => ({
      key: field.key,
      label: field.label,
      source: 'property' as const,
      fieldType: field.fieldType,
      options: getFieldOptions(field),
    }));

  return [...SYSTEM_FIELDS, ...propertyFields];
}

export function buildDefaultSavedViewConfig(
  fields: StructuredFieldDefinition[],
): SavedViewConfig {
  return {
    filters: [],
    sort: [],
    columns: fields.map((field, index) => ({
      key: field.key,
      source: field.source,
      visible:
        field.source === 'system'
          ? DEFAULT_VISIBLE_SYSTEM_COLUMNS.has(field.key)
          : index < SYSTEM_FIELDS.length + 2,
      width: field.key === 'title' ? 320 : null,
    })),
  };
}

export function normalizeSavedViewConfig(
  config: SavedViewConfig,
  fields: StructuredFieldDefinition[],
): SavedViewConfig {
  const available = new Map(fields.map((field) => [toColumnId(field.source, field.key), field]));
  const columns = config.columns.filter((column) => available.has(toColumnId(column.source, column.key)));
  const seenColumns = new Set(columns.map((column) => toColumnId(column.source, column.key)));

  for (const field of fields) {
    const columnId = toColumnId(field.source, field.key);

    if (!seenColumns.has(columnId)) {
      columns.push({
        key: field.key,
        source: field.source,
        visible:
          field.source === 'system'
            ? DEFAULT_VISIBLE_SYSTEM_COLUMNS.has(field.key)
            : false,
        width: field.key === 'title' ? 320 : null,
      });
    }
  }

  return {
    filters: config.filters.filter((filter) => filterToAvailableField(fields, filter)),
    sort: config.sort.filter((sort) => filterToAvailableField(fields, sort)),
    columns,
  };
}

export function createStructuredViewDraft(
  entityTypes: EntityTypeRecord[],
  entityTypeId: string | null,
  viewType: SavedViewMode = 'table',
): StructuredViewDraft {
  const fields = buildStructuredFields(entityTypes, entityTypeId);

  return {
    name: '',
    description: '',
    entityTypeId,
    viewType,
    config: buildDefaultSavedViewConfig(fields),
  };
}

export function syncStructuredViewDraft(
  draft: StructuredViewDraft,
  entityTypes: EntityTypeRecord[],
): StructuredViewDraft {
  const fields = buildStructuredFields(entityTypes, draft.entityTypeId);

  return {
    ...draft,
    config: normalizeSavedViewConfig(draft.config, fields),
  };
}

export function buildDraftFromSavedView(
  savedView: SavedViewRecord,
  entityTypes: EntityTypeRecord[],
): StructuredViewDraft {
  const fields = buildStructuredFields(entityTypes, savedView.entityTypeId);

  return {
    name: savedView.name,
    description: savedView.description ?? '',
    entityTypeId: savedView.entityTypeId,
    viewType: savedView.viewType,
    config: normalizeSavedViewConfig(savedView.config, fields),
  };
}

export function serializeStructuredViewDraft(
  draft: StructuredViewDraft,
  entityTypes: EntityTypeRecord[],
) {
  const fields = buildStructuredFields(entityTypes, draft.entityTypeId);

  return {
    name: draft.name.trim(),
    description: draft.description.trim() ? draft.description.trim() : null,
    entityTypeId: draft.entityTypeId,
    viewType: draft.viewType,
    config: normalizeSavedViewConfig(draft.config, fields),
  };
}

export function buildStructuredRows(params: {
  entities: EntityRecord[];
  entityTypes: EntityTypeRecord[];
  currentUser?: UserRecord | null;
  draft: StructuredViewDraft;
}) {
  const { entities, entityTypes, currentUser, draft } = params;
  const fields = buildStructuredFields(entityTypes, draft.entityTypeId);
  const config = normalizeSavedViewConfig(draft.config, fields);
  const entityTypeById = new Map(entityTypes.map((entityType) => [entityType.id, entityType]));

  let rows = entities
    .filter((entity) => (draft.entityTypeId ? entity.entityTypeId === draft.entityTypeId : true))
    .map<StructuredRow>((entity) => {
      const entityType = entityTypeById.get(entity.entityTypeId ?? '') ?? null;
      const cells = Object.fromEntries(
        fields.map((field) => {
          const rawValue = getFieldValue(entity, field);

          return [
            toColumnId(field.source, field.key),
            {
              rawValue,
              displayValue:
                field.source === 'property' && entityType
                  ? formatFieldValue(
                      entityType.fields.find((item) => item.key === field.key) ?? {
                        id: '',
                        workspaceId: entity.workspaceId,
                        entityTypeId: entity.entityTypeId ?? '',
                        key: field.key,
                        label: field.label,
                        fieldType: field.fieldType === 'system' ? 'text' : field.fieldType,
                        description: null,
                        required: false,
                        order: 0,
                        config: {},
                        createdAt: entity.createdAt,
                        updatedAt: entity.updatedAt,
                      },
                      rawValue,
                      { entities, currentUser },
                    )
                  : rawValue === null || rawValue === undefined
                    ? 'Не задано'
                    : String(rawValue),
            },
          ];
        }),
      );

      return {
        entity,
        entityType,
        cells,
      };
    });

  rows = rows.filter((row) =>
    config.filters.every((filter) =>
      matchesFilter(row.cells[toColumnId(filter.source, filter.key)]?.rawValue, filter),
    ),
  );

  rows = rows.slice().sort((left, right) => {
    for (const sort of config.sort) {
      const comparison = compareValues(
        left.cells[toColumnId(sort.source, sort.key)]?.rawValue,
        right.cells[toColumnId(sort.source, sort.key)]?.rawValue,
        sort.direction,
      );

      if (comparison !== 0) {
        return comparison;
      }
    }

    return left.entity.createdAt.localeCompare(right.entity.createdAt);
  });

  return {
    fields,
    config,
    rows,
    visibleColumns: config.columns.filter((column) => column.visible),
  };
}

export function moveColumn(
  columns: SavedViewColumnConfig[],
  columnId: string,
  direction: 'left' | 'right',
): SavedViewColumnConfig[] {
  const index = columns.findIndex((column) => toColumnId(column.source, column.key) === columnId);

  if (index < 0) {
    return columns;
  }

  const nextIndex = direction === 'left' ? index - 1 : index + 1;

  if (nextIndex < 0 || nextIndex >= columns.length) {
    return columns;
  }

  const nextColumns = columns.slice();
  const [column] = nextColumns.splice(index, 1);
  nextColumns.splice(nextIndex, 0, column);

  return nextColumns;
}

export function createFilterDraft(
  fields: StructuredFieldDefinition[],
): SavedViewFilterConfig {
  const field = fields[0];

  return {
    id: `filter-${Math.random().toString(36).slice(2, 10)}`,
    key: field?.key ?? 'title',
    source: field?.source ?? 'system',
    operator: 'contains',
    value: '',
  };
}

export function createSortDraft(
  fields: StructuredFieldDefinition[],
): SavedViewSortConfig {
  const updatedAtField = fields.find((field) => field.source === 'system' && field.key === 'updatedAt');
  const fallbackField = updatedAtField ?? fields[0];

  return {
    key: fallbackField?.key ?? 'updatedAt',
    source: fallbackField?.source ?? 'system',
    direction: 'desc',
  };
}

export function getColumnId(column: Pick<SavedViewColumnConfig, 'key' | 'source'>) {
  return toColumnId(column.source, column.key);
}

export function getFieldOperatorOptions(field: StructuredFieldDefinition): SavedViewFilterOperator[] {
  if (field.fieldType === 'number' || field.fieldType === 'date') {
    return ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'];
  }

  return ['contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'];
}
