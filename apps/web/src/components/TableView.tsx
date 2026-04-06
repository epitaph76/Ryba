import { useMemo, useRef } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import type {
  EntityTypeRecord,
  SavedViewColumnConfig,
  SavedViewFilterConfig,
  SavedViewRecord,
  SavedViewSortConfig,
  UserRecord,
} from '@ryba/types';

import {
  buildStructuredFields,
  buildStructuredRows,
  createFilterDraft,
  createSortDraft,
  getColumnId,
  getFieldOperatorOptions,
  moveColumn,
  syncStructuredViewDraft,
  type StructuredFieldDefinition,
  type StructuredRow,
  type StructuredViewDraft,
} from '../table-model';
import { SavedViewsBar } from './SavedViewsBar';

type TableViewProps = {
  entities: Parameters<typeof buildStructuredRows>[0]['entities'];
  entityTypes: EntityTypeRecord[];
  currentUser: UserRecord | null;
  draft: StructuredViewDraft;
  activeSavedViewId: string | null;
  savedViews: SavedViewRecord[];
  loading: boolean;
  disabled: boolean;
  busy: boolean;
  selectedEntityId?: string | null;
  onDraftChange: (draft: StructuredViewDraft) => void;
  onSelectEntity: (entityId: string) => void;
  onSelectSavedView: (savedViewId: string | null) => void;
  onCreateSavedView: (name: string) => void;
  onOverwriteSavedView: (savedViewId: string) => void;
  onDeleteSavedView: (savedViewId: string) => void;
  onResetSavedViewDraft: () => void;
};

const columnHelper = createColumnHelper<StructuredRow>();
const EMPTY_VALUE = 'Не задано';

function getFieldByColumnId(fields: StructuredFieldDefinition[], columnId: string) {
  return fields.find((field) => getColumnId(field) === columnId) ?? null;
}

function FilterRow(props: {
  filter: SavedViewFilterConfig;
  fields: StructuredFieldDefinition[];
  disabled: boolean;
  onChange: (filter: SavedViewFilterConfig) => void;
  onRemove: () => void;
}) {
  const { filter, fields, disabled, onChange, onRemove } = props;
  const selectedField = getFieldByColumnId(fields, getColumnId(filter)) ?? fields[0] ?? null;
  const operatorOptions = selectedField ? getFieldOperatorOptions(selectedField) : ['contains'];

  return (
    <div className="filter-row">
      <label className="field">
        <span>Поле</span>
        <select
          value={getColumnId(filter)}
          disabled={disabled}
          onChange={(event) => {
            const nextField = getFieldByColumnId(fields, event.target.value);

            if (!nextField) {
              return;
            }

            onChange({
              ...filter,
              key: nextField.key,
              source: nextField.source,
              operator: getFieldOperatorOptions(nextField)[0] ?? 'contains',
              value: '',
            });
          }}
        >
          {fields.map((field) => (
            <option key={getColumnId(field)} value={getColumnId(field)}>
              {field.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Оператор</span>
        <select
          value={filter.operator}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...filter,
              operator: event.target.value as SavedViewFilterConfig['operator'],
            })
          }
        >
          {operatorOptions.map((operator) => (
            <option key={operator} value={operator}>
              {operator}
            </option>
          ))}
        </select>
      </label>

      {filter.operator === 'is_empty' || filter.operator === 'is_not_empty' ? null : (
        <label className="field">
          <span>Значение</span>
          <input
            type="text"
            value={typeof filter.value === 'string' || typeof filter.value === 'number' ? String(filter.value) : ''}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...filter,
                value: event.target.value,
              })
            }
          />
        </label>
      )}

      <button type="button" className="button button--ghost" disabled={disabled} onClick={onRemove}>
        Удалить
      </button>
    </div>
  );
}

function SortRow(props: {
  sort: SavedViewSortConfig;
  fields: StructuredFieldDefinition[];
  disabled: boolean;
  onChange: (sort: SavedViewSortConfig) => void;
  onRemove: () => void;
}) {
  const { sort, fields, disabled, onChange, onRemove } = props;

  return (
    <div className="filter-row">
      <label className="field">
        <span>Поле</span>
        <select
          value={getColumnId(sort)}
          disabled={disabled}
          onChange={(event) => {
            const nextField = getFieldByColumnId(fields, event.target.value);

            if (!nextField) {
              return;
            }

            onChange({
              ...sort,
              key: nextField.key,
              source: nextField.source,
            });
          }}
        >
          {fields.map((field) => (
            <option key={getColumnId(field)} value={getColumnId(field)}>
              {field.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Направление</span>
        <select
          value={sort.direction}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...sort,
              direction: event.target.value as SavedViewSortConfig['direction'],
            })
          }
        >
          <option value="asc">По возрастанию</option>
          <option value="desc">По убыванию</option>
        </select>
      </label>

      <button type="button" className="button button--ghost" disabled={disabled} onClick={onRemove}>
        Удалить
      </button>
    </div>
  );
}

function ColumnRow(props: {
  column: SavedViewColumnConfig;
  index: number;
  total: number;
  field: StructuredFieldDefinition | null;
  disabled: boolean;
  onToggle: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}) {
  const { column, index, total, field, disabled, onToggle, onMoveLeft, onMoveRight } = props;

  return (
    <div className="column-row">
      <label className="checkbox-field">
        <input type="checkbox" checked={column.visible} disabled={disabled} onChange={onToggle} />
        <span>{field?.label ?? column.key}</span>
      </label>
      <div className="column-row__actions">
        <button
          type="button"
          className="button button--ghost"
          disabled={disabled || index === 0}
          onClick={onMoveLeft}
        >
          Влево
        </button>
        <button
          type="button"
          className="button button--ghost"
          disabled={disabled || index === total - 1}
          onClick={onMoveRight}
        >
          Вправо
        </button>
      </div>
    </div>
  );
}

export function TableView({
  entities,
  entityTypes,
  currentUser,
  draft,
  activeSavedViewId,
  savedViews,
  loading,
  disabled,
  busy,
  selectedEntityId = null,
  onDraftChange,
  onSelectEntity,
  onSelectSavedView,
  onCreateSavedView,
  onOverwriteSavedView,
  onDeleteSavedView,
  onResetSavedViewDraft,
}: TableViewProps) {
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const syncedDraft = useMemo(() => syncStructuredViewDraft(draft, entityTypes), [draft, entityTypes]);
  const activeSavedView = savedViews.find((savedView) => savedView.id === activeSavedViewId) ?? null;
  const fields = useMemo(
    () => buildStructuredFields(entityTypes, syncedDraft.entityTypeId),
    [entityTypes, syncedDraft.entityTypeId],
  );
  const fieldById = useMemo(
    () => new Map(fields.map((field) => [getColumnId(field), field])),
    [fields],
  );
  const result = useMemo(
    () =>
      buildStructuredRows({
        entities,
        entityTypes,
        currentUser,
        draft: syncedDraft,
      }),
    [currentUser, entities, entityTypes, syncedDraft],
  );
  const visibleColumns = useMemo(
    () =>
      result.config.columns
        .filter((column) => column.visible)
        .map((column) => ({
          column,
          field: fieldById.get(getColumnId(column)) ?? null,
        }))
        .filter(
          (item): item is { column: SavedViewColumnConfig; field: StructuredFieldDefinition } =>
            Boolean(item.field),
        ),
    [fieldById, result.config.columns],
  );
  const tableColumns = useMemo(
    () =>
      visibleColumns.map(({ column, field }) =>
        columnHelper.accessor((row) => row.cells[getColumnId(column)]?.displayValue ?? EMPTY_VALUE, {
          id: getColumnId(column),
          header: field.label,
          cell: (info) => info.getValue(),
        }),
      ),
    [visibleColumns],
  );
  const table = useReactTable({
    data: result.rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });
  const tableRows = table.getRowModel().rows;
  const tableVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });
  const listVirtualizer = useVirtualizer({
    count: result.rows.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => 112,
    overscan: 8,
  });

  const updateDraft = (nextDraft: StructuredViewDraft) => {
    onDraftChange(syncStructuredViewDraft(nextDraft, entityTypes));
  };

  const updateConfig = (updater: (config: StructuredViewDraft['config']) => StructuredViewDraft['config']) => {
    updateDraft({
      ...syncedDraft,
      config: updater(syncedDraft.config),
    });
  };

  const tableVirtualItems = tableVirtualizer.getVirtualItems();
  const topTablePadding = tableVirtualItems[0]?.start ?? 0;
  const bottomTablePadding =
    tableVirtualItems.length > 0
      ? tableVirtualizer.getTotalSize() - (tableVirtualItems[tableVirtualItems.length - 1]?.end ?? 0)
      : 0;
  const listVirtualItems = listVirtualizer.getVirtualItems();

  return (
    <section className="table-view">
      <aside className="table-view__sidebar">
        <SavedViewsBar
          savedViews={savedViews}
          activeSavedViewId={activeSavedViewId}
          disabled={disabled}
          busy={busy}
          onSelectSavedView={onSelectSavedView}
          onCreateSavedView={onCreateSavedView}
          onOverwriteSavedView={onOverwriteSavedView}
          onDeleteSavedView={onDeleteSavedView}
          onReset={onResetSavedViewDraft}
        />

        <section className="panel table-panel">
          <div className="panel__header">
            <h2>Линза</h2>
            <span>{result.rows.length} строк</span>
          </div>

          <div className="view-toggle">
            <button
              type="button"
              className={`view-toggle__button${syncedDraft.viewType === 'table' ? ' is-active' : ''}`}
              disabled={disabled || busy}
              onClick={() => updateDraft({ ...syncedDraft, viewType: 'table' })}
            >
              Таблица
            </button>
            <button
              type="button"
              className={`view-toggle__button${syncedDraft.viewType === 'list' ? ' is-active' : ''}`}
              disabled={disabled || busy}
              onClick={() => updateDraft({ ...syncedDraft, viewType: 'list' })}
            >
              Список
            </button>
          </div>

          <label className="field">
            <span>Тип сущностей</span>
            <select
              value={syncedDraft.entityTypeId ?? ''}
              disabled={disabled || busy}
              onChange={(event) =>
                updateDraft({
                  ...syncedDraft,
                  entityTypeId: event.target.value || null,
                })
              }
            >
              <option value="">Все типы</option>
              {entityTypes.map((entityType) => (
                <option key={entityType.id} value={entityType.id}>
                  {entityType.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="panel table-panel">
          <div className="panel__header">
            <h2>Фильтры</h2>
            <button
              type="button"
              className="button button--ghost"
              disabled={disabled || busy || fields.length === 0}
              onClick={() =>
                updateConfig((config) => ({
                  ...config,
                  filters: [...config.filters, createFilterDraft(fields)],
                }))
              }
            >
              Добавить
            </button>
          </div>

          <div className="filter-list">
            {syncedDraft.config.filters.length === 0 ? (
              <p className="panel__hint">Фильтров пока нет. Добавь первый, чтобы сохранить рабочую выборку.</p>
            ) : (
              syncedDraft.config.filters.map((filter) => (
                <FilterRow
                  key={filter.id}
                  filter={filter}
                  fields={fields}
                  disabled={disabled || busy}
                  onChange={(nextFilter) =>
                    updateConfig((config) => ({
                      ...config,
                      filters: config.filters.map((current) =>
                        current.id === filter.id ? nextFilter : current,
                      ),
                    }))
                  }
                  onRemove={() =>
                    updateConfig((config) => ({
                      ...config,
                      filters: config.filters.filter((current) => current.id !== filter.id),
                    }))
                  }
                />
              ))
            )}
          </div>
        </section>

        <section className="panel table-panel">
          <div className="panel__header">
            <h2>Сортировка</h2>
            <button
              type="button"
              className="button button--ghost"
              disabled={disabled || busy || fields.length === 0}
              onClick={() =>
                updateConfig((config) => ({
                  ...config,
                  sort: [...config.sort, createSortDraft(fields)],
                }))
              }
            >
              Добавить
            </button>
          </div>

          <div className="filter-list">
            {syncedDraft.config.sort.length === 0 ? (
              <p className="panel__hint">Сортировка не задана. Записи идут в стабильном порядке по времени создания.</p>
            ) : (
              syncedDraft.config.sort.map((sort, index) => (
                <SortRow
                  key={`${sort.source}:${sort.key}:${index}`}
                  sort={sort}
                  fields={fields}
                  disabled={disabled || busy}
                  onChange={(nextSort) =>
                    updateConfig((config) => ({
                      ...config,
                      sort: config.sort.map((current, currentIndex) =>
                        currentIndex === index ? nextSort : current,
                      ),
                    }))
                  }
                  onRemove={() =>
                    updateConfig((config) => ({
                      ...config,
                      sort: config.sort.filter((_, currentIndex) => currentIndex !== index),
                    }))
                  }
                />
              ))
            )}
          </div>
        </section>

        <section className="panel table-panel">
          <div className="panel__header">
            <h2>Колонки</h2>
            <span>{visibleColumns.length} видимых</span>
          </div>

          <div className="filter-list">
            {result.config.columns.map((column, index) => (
              <ColumnRow
                key={getColumnId(column)}
                column={column}
                index={index}
                total={result.config.columns.length}
                field={fieldById.get(getColumnId(column)) ?? null}
                disabled={disabled || busy}
                onToggle={() =>
                  updateConfig((config) => ({
                    ...config,
                    columns: config.columns.map((current) =>
                      getColumnId(current) === getColumnId(column)
                        ? { ...current, visible: !current.visible }
                        : current,
                    ),
                  }))
                }
                onMoveLeft={() =>
                  updateConfig((config) => ({
                    ...config,
                    columns: moveColumn(config.columns, getColumnId(column), 'left'),
                  }))
                }
                onMoveRight={() =>
                  updateConfig((config) => ({
                    ...config,
                    columns: moveColumn(config.columns, getColumnId(column), 'right'),
                  }))
                }
              />
            ))}
          </div>
        </section>
      </aside>

      <div className="table-view__stage">
        <div className="canvas-toolbar">
          <div className="canvas-toolbar__copy">
            <strong>{activeSavedView?.name ?? 'Черновик представления'}</strong>
            <span>
              {activeSavedView
                ? activeSavedView.description ?? 'Сохранённая рабочая линза этого space.'
                : 'Настрой фильтры, сортировку и колонки, затем сохрани конфигурацию как saved view.'}
            </span>
          </div>
          <div className="canvas-toolbar__actions">
            <span className="status-pill">
              {syncedDraft.viewType === 'table' ? 'Табличный режим' : 'Списочный режим'}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="table-shell">
            <div className="canvas-empty">
              <strong>Загрузка представления</strong>
              <p>Читаю сущности и сохранённые views текущего пространства.</p>
            </div>
          </div>
        ) : result.rows.length === 0 ? (
          <div className="table-shell">
            <div className="canvas-empty">
              <strong>Нечего показывать</strong>
              <p>Смени фильтры, тип сущностей или создай первую запись, чтобы заполнить это представление.</p>
            </div>
          </div>
        ) : syncedDraft.viewType === 'table' ? (
          <div className="table-shell">
            {visibleColumns.length === 0 ? (
              <div className="canvas-empty">
                <strong>Нет видимых колонок</strong>
                <p>Включи хотя бы одну колонку в боковой панели, чтобы таблица стала читаемой.</p>
              </div>
            ) : (
              <div className="table-scroll" ref={tableScrollRef}>
                <table className="entity-table">
                  <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <th key={header.id}>
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {topTablePadding > 0 ? (
                      <tr>
                        <td colSpan={visibleColumns.length} style={{ height: `${topTablePadding}px` }} />
                      </tr>
                    ) : null}

                    {tableVirtualItems.map((virtualRow) => {
                      const row = tableRows[virtualRow.index];

                      if (!row) {
                        return null;
                      }

                      return (
                        <tr
                          key={row.id}
                          className={`entity-table__row${
                            row.original.entity.id === selectedEntityId ? ' is-selected' : ''
                          }`}
                          onClick={() => onSelectEntity(row.original.entity.id)}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                          ))}
                        </tr>
                      );
                    })}

                    {bottomTablePadding > 0 ? (
                      <tr>
                        <td colSpan={visibleColumns.length} style={{ height: `${bottomTablePadding}px` }} />
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="list-shell" ref={listScrollRef}>
            <div style={{ height: `${listVirtualizer.getTotalSize()}px`, position: 'relative' }}>
              {listVirtualItems.map((virtualRow) => {
                const row = result.rows[virtualRow.index];

                if (!row) {
                  return null;
                }

                const primary = visibleColumns[0];
                const secondaryColumns = visibleColumns.slice(1, 4);

                return (
                  <button
                    key={row.entity.id}
                    type="button"
                    className={`list-row-card${row.entity.id === selectedEntityId ? ' is-selected' : ''}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() => onSelectEntity(row.entity.id)}
                  >
                    <div className="list-row-card__header">
                      <strong>
                        {primary ? row.cells[getColumnId(primary.column)]?.displayValue ?? EMPTY_VALUE : row.entity.title}
                      </strong>
                      <span>{row.entityType?.name ?? 'Без типа'}</span>
                    </div>
                    <div className="list-row-card__meta">
                      {secondaryColumns.map(({ column, field }) => (
                        <span key={getColumnId(column)}>
                          <strong>{field.label}:</strong> {row.cells[getColumnId(column)]?.displayValue ?? EMPTY_VALUE}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
