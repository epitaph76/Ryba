import { useEffect, useMemo, useState } from 'react';
import type { DataSourceRecord, QueryRunRecord, SavedQueryRecord } from '@ryba/types';

import {
  buildQueryRunSummary,
  buildSavedQueryEditorDraft,
  buildSavedQueryExecutionDraft,
  createEmptySavedQueryEditorDraft,
  createEmptySavedQueryParameterDraft,
  formatDatasetCellValue,
  serializeSavedQueryEditorDraft,
  serializeSavedQueryExecutionInput,
  type SavedQueryEditorDraft,
} from '../external-data-model';

type SavedQueryMutationInput = ReturnType<typeof serializeSavedQueryEditorDraft>;

type ExternalDataPanelProps = {
  scopeLabel: string;
  dataSources: DataSourceRecord[];
  savedQueries: SavedQueryRecord[];
  activeSavedQueryId: string | null;
  queryRuns: QueryRunRecord[];
  disabled: boolean;
  busy: boolean;
  canManageDataSources: boolean;
  canEditQueries: boolean;
  canPublishOutputs: boolean;
  onSelectSavedQuery: (savedQueryId: string | null) => void;
  onCreateDataSource: (input: {
    name: string;
    description?: string | null;
    connectionString: string;
  }) => void | Promise<void>;
  onCreateSavedQuery: (input: SavedQueryMutationInput) => void | Promise<void>;
  onUpdateSavedQuery: (
    savedQueryId: string,
    input: SavedQueryMutationInput,
  ) => void | Promise<void>;
  onDeleteSavedQuery: (savedQueryId: string) => void | Promise<void>;
  onExecuteSavedQuery: (
    savedQueryId: string,
    input: ReturnType<typeof serializeSavedQueryExecutionInput>,
  ) => void | Promise<void>;
  onPublishQueryRun: (
    queryRunId: string,
    input: { title?: string },
  ) => void | Promise<void>;
};

export function ExternalDataPanel({
  scopeLabel,
  dataSources,
  savedQueries,
  activeSavedQueryId,
  queryRuns,
  disabled,
  busy,
  canManageDataSources,
  canEditQueries,
  canPublishOutputs,
  onSelectSavedQuery,
  onCreateDataSource,
  onCreateSavedQuery,
  onUpdateSavedQuery,
  onDeleteSavedQuery,
  onExecuteSavedQuery,
  onPublishQueryRun,
}: ExternalDataPanelProps) {
  const activeSavedQuery =
    savedQueries.find((savedQuery) => savedQuery.id === activeSavedQueryId) ?? null;
  const defaultDataSourceId = dataSources[0]?.id ?? '';
  const [dataSourceName, setDataSourceName] = useState('');
  const [dataSourceDescription, setDataSourceDescription] = useState('');
  const [dataSourceConnectionString, setDataSourceConnectionString] = useState('');
  const [queryDraft, setQueryDraft] = useState<SavedQueryEditorDraft>(() =>
    createEmptySavedQueryEditorDraft(defaultDataSourceId),
  );
  const [executionDraft, setExecutionDraft] = useState<Record<string, string>>({});
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [publishTitle, setPublishTitle] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setQueryDraft(buildSavedQueryEditorDraft(activeSavedQuery, defaultDataSourceId));
    setExecutionDraft(buildSavedQueryExecutionDraft(activeSavedQuery));
    setPublishTitle('');
    setLocalError(null);
  }, [activeSavedQuery, defaultDataSourceId]);

  useEffect(() => {
    setSelectedRunId((current) =>
      current && queryRuns.some((run) => run.id === current) ? current : queryRuns[0]?.id ?? null,
    );
  }, [queryRuns]);

  const selectedRun = useMemo(
    () => queryRuns.find((run) => run.id === selectedRunId) ?? queryRuns[0] ?? null,
    [queryRuns, selectedRunId],
  );

  const handleResetQueryDraft = () => {
    onSelectSavedQuery(null);
    setQueryDraft(createEmptySavedQueryEditorDraft(defaultDataSourceId));
    setExecutionDraft({});
    setLocalError(null);
  };

  const handlePersistQuery = (mode: 'create' | 'update') => {
    try {
      const payload = serializeSavedQueryEditorDraft(queryDraft);
      setLocalError(null);

      if (mode === 'create' || !activeSavedQuery) {
        void Promise.resolve(onCreateSavedQuery(payload));
        return;
      }

      void Promise.resolve(onUpdateSavedQuery(activeSavedQuery.id, payload));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to prepare query payload.');
    }
  };

  const handleExecuteQuery = () => {
    if (!activeSavedQuery) {
      return;
    }

    try {
      const payload = serializeSavedQueryExecutionInput(activeSavedQuery, executionDraft);
      setLocalError(null);
      void Promise.resolve(onExecuteSavedQuery(activeSavedQuery.id, payload));
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to prepare query execution.');
    }
  };

  return (
    <section className="external-data-shell">
      <aside className="external-data-shell__sidebar">
        <section className="panel external-data-panel">
          <div className="panel__header">
            <h2>External Sources</h2>
            <span>{dataSources.length} connected</span>
          </div>

          <div className="external-chip-list">
            {dataSources.length === 0 ? (
              <p className="panel__hint">No external sources are connected to this workspace yet.</p>
            ) : (
              dataSources.map((dataSource) => (
                <div key={dataSource.id} className="external-chip external-chip--static">
                  <strong>{dataSource.name}</strong>
                  <span>
                    {dataSource.username}@{dataSource.host}/{dataSource.databaseName}
                  </span>
                </div>
              ))
            )}
          </div>

          {canManageDataSources ? (
            <>
              <label className="field">
                <span>Source name</span>
                <input
                  type="text"
                  value={dataSourceName}
                  disabled={disabled || busy}
                  onChange={(event) => setDataSourceName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Description</span>
                <input
                  type="text"
                  value={dataSourceDescription}
                  disabled={disabled || busy}
                  onChange={(event) => setDataSourceDescription(event.target.value)}
                />
              </label>
              <label className="field">
                <span>PostgreSQL connection string</span>
                <textarea
                  value={dataSourceConnectionString}
                  disabled={disabled || busy}
                  rows={4}
                  onChange={(event) => setDataSourceConnectionString(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="button"
                disabled={
                  disabled ||
                  busy ||
                  dataSourceName.trim().length === 0 ||
                  dataSourceConnectionString.trim().length === 0
                }
                onClick={() => {
                  setLocalError(null);
                  void Promise.resolve(
                    onCreateDataSource({
                      name: dataSourceName.trim(),
                      description: dataSourceDescription.trim() || null,
                      connectionString: dataSourceConnectionString.trim(),
                    }),
                  );
                  setDataSourceName('');
                  setDataSourceDescription('');
                  setDataSourceConnectionString('');
                }}
              >
                Connect source
              </button>
            </>
          ) : (
            <p className="panel__hint">
              Data sources are managed by workspace owners. You can still execute saved queries
              below.
            </p>
          )}
        </section>

        <section className="panel external-data-panel">
          <div className="panel__header">
            <h2>Saved Queries</h2>
            <span>{scopeLabel}</span>
          </div>

          <div className="saved-views-panel__list">
            {savedQueries.length === 0 ? (
              <p className="panel__hint">No saved queries in this scope yet.</p>
            ) : (
              savedQueries.map((savedQuery) => (
                <button
                  key={savedQuery.id}
                  type="button"
                  className={`saved-view-chip${savedQuery.id === activeSavedQueryId ? ' is-active' : ''}`}
                  disabled={disabled || busy}
                  onClick={() => onSelectSavedQuery(savedQuery.id)}
                >
                  <strong>{savedQuery.name}</strong>
                  <span>{savedQuery.parameterDefinitions.length} params</span>
                </button>
              ))
            )}
          </div>

          <button
            type="button"
            className="button button--ghost button--full"
            disabled={disabled || busy}
            onClick={handleResetQueryDraft}
          >
            New query draft
          </button>

          <label className="field">
            <span>Query name</span>
            <input
              type="text"
              value={queryDraft.name}
              disabled={disabled || busy || !canEditQueries}
              onChange={(event) =>
                setQueryDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>
          <label className="field">
            <span>Data source</span>
            <select
              value={queryDraft.dataSourceId}
              disabled={disabled || busy || !canEditQueries || dataSources.length === 0}
              onChange={(event) =>
                setQueryDraft((current) => ({
                  ...current,
                  dataSourceId: event.target.value,
                }))
              }
            >
              <option value="">Select source</option>
              {dataSources.map((dataSource) => (
                <option key={dataSource.id} value={dataSource.id}>
                  {dataSource.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Description</span>
            <input
              type="text"
              value={queryDraft.description}
              disabled={disabled || busy || !canEditQueries}
              onChange={(event) =>
                setQueryDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
          <label className="field">
            <span>SQL template</span>
            <textarea
              value={queryDraft.sqlTemplate}
              disabled={disabled || busy || !canEditQueries}
              rows={8}
              onChange={(event) =>
                setQueryDraft((current) => ({
                  ...current,
                  sqlTemplate: event.target.value,
                }))
              }
            />
          </label>

          <div className="panel__header">
            <h2>Parameters</h2>
            <button
              type="button"
              className="button button--ghost"
              disabled={disabled || busy || !canEditQueries}
              onClick={() =>
                setQueryDraft((current) => ({
                  ...current,
                  parameterDefinitions: [
                    ...current.parameterDefinitions,
                    createEmptySavedQueryParameterDraft(),
                  ],
                }))
              }
            >
              Add parameter
            </button>
          </div>

          <div className="external-parameter-list">
            {queryDraft.parameterDefinitions.length === 0 ? (
              <p className="panel__hint">
                No parameters yet. Use <code>{'{{named_params}}'}</code> in SQL when needed.
              </p>
            ) : (
              queryDraft.parameterDefinitions.map((parameter, index) => (
                <div key={`${parameter.name}-${index}`} className="external-parameter-card">
                  <label className="field">
                    <span>Name</span>
                    <input
                      type="text"
                      value={parameter.name}
                      disabled={disabled || busy || !canEditQueries}
                      onChange={(event) =>
                        setQueryDraft((current) => ({
                          ...current,
                          parameterDefinitions: current.parameterDefinitions.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, name: event.target.value } : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Label</span>
                    <input
                      type="text"
                      value={parameter.label}
                      disabled={disabled || busy || !canEditQueries}
                      onChange={(event) =>
                        setQueryDraft((current) => ({
                          ...current,
                          parameterDefinitions: current.parameterDefinitions.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, label: event.target.value } : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Type</span>
                    <select
                      value={parameter.type}
                      disabled={disabled || busy || !canEditQueries}
                      onChange={(event) =>
                        setQueryDraft((current) => ({
                          ...current,
                          parameterDefinitions: current.parameterDefinitions.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  type: event.target.value as SavedQueryEditorDraft['parameterDefinitions'][number]['type'],
                                }
                              : item,
                          ),
                        }))
                      }
                    >
                      <option value="text">text</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                      <option value="date">date</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Default</span>
                    <input
                      type={parameter.type === 'number' ? 'number' : parameter.type === 'date' ? 'date' : 'text'}
                      value={parameter.defaultValue}
                      disabled={disabled || busy || !canEditQueries}
                      onChange={(event) =>
                        setQueryDraft((current) => ({
                          ...current,
                          parameterDefinitions: current.parameterDefinitions.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, defaultValue: event.target.value }
                              : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={parameter.required}
                      disabled={disabled || busy || !canEditQueries}
                      onChange={(event) =>
                        setQueryDraft((current) => ({
                          ...current,
                          parameterDefinitions: current.parameterDefinitions.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, required: event.target.checked }
                              : item,
                          ),
                        }))
                      }
                    />
                    <span>Required</span>
                  </label>
                  <label className="field">
                    <span>Description</span>
                    <input
                      type="text"
                      value={parameter.description}
                      disabled={disabled || busy || !canEditQueries}
                      onChange={(event) =>
                        setQueryDraft((current) => ({
                          ...current,
                          parameterDefinitions: current.parameterDefinitions.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, description: event.target.value }
                              : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={disabled || busy || !canEditQueries}
                    onClick={() =>
                      setQueryDraft((current) => ({
                        ...current,
                        parameterDefinitions: current.parameterDefinitions.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>

          {localError ? <p className="panel__hint panel__hint--danger">{localError}</p> : null}

          <div className="actions">
            <button
              type="button"
              className="button"
              disabled={
                disabled ||
                busy ||
                !canEditQueries ||
                queryDraft.name.trim().length === 0 ||
                queryDraft.dataSourceId.length === 0 ||
                queryDraft.sqlTemplate.trim().length === 0
              }
              onClick={() => handlePersistQuery(activeSavedQuery ? 'update' : 'create')}
            >
              {activeSavedQuery ? 'Update query' : 'Save query'}
            </button>
            <button
              type="button"
              className="button button--ghost"
              disabled={disabled || busy || !canEditQueries || !activeSavedQuery}
              onClick={() => activeSavedQuery && void Promise.resolve(onDeleteSavedQuery(activeSavedQuery.id))}
            >
              Delete query
            </button>
          </div>
        </section>
      </aside>

      <div className="external-data-shell__stage">
        <div className="canvas-toolbar">
          <div className="canvas-toolbar__copy">
            <strong>{activeSavedQuery?.name ?? 'External dataset'}</strong>
            <span>
              {activeSavedQuery
                ? `Run a saved query in ${scopeLabel}, inspect the dataset, then publish a snapshot back into the workspace.`
                : 'Select or create a saved query to inspect external data without leaving the workspace.'}
            </span>
          </div>
          <div className="canvas-toolbar__actions">
            <span className="status-pill">
              {selectedRun?.status === 'failed'
                ? 'Run failed'
                : selectedRun
                  ? 'Dataset ready'
                  : 'Waiting for run'}
            </span>
          </div>
        </div>

        <section className="panel external-data-panel external-data-panel--execution">
          <div className="panel__header">
            <h2>Execution</h2>
            <span>{buildQueryRunSummary(selectedRun)}</span>
          </div>

          {!activeSavedQuery ? (
            <p className="panel__hint">Pick a saved query to define parameters and run it.</p>
          ) : (
            <>
              <div className="external-parameter-list external-parameter-list--inputs">
                {activeSavedQuery.parameterDefinitions.length === 0 ? (
                  <p className="panel__hint">This query does not require runtime parameters.</p>
                ) : (
                  activeSavedQuery.parameterDefinitions.map((parameter) => (
                    <label key={parameter.name} className="field">
                      <span>{parameter.label}</span>
                      {parameter.type === 'boolean' ? (
                        <select
                          value={executionDraft[parameter.name] ?? ''}
                          disabled={disabled || busy}
                          onChange={(event) =>
                            setExecutionDraft((current) => ({
                              ...current,
                              [parameter.name]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Empty</option>
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          type={
                            parameter.type === 'number'
                              ? 'number'
                              : parameter.type === 'date'
                                ? 'date'
                                : 'text'
                          }
                          value={executionDraft[parameter.name] ?? ''}
                          disabled={disabled || busy}
                          onChange={(event) =>
                            setExecutionDraft((current) => ({
                              ...current,
                              [parameter.name]: event.target.value,
                            }))
                          }
                        />
                      )}
                    </label>
                  ))
                )}
              </div>

              <div className="actions">
                <button
                  type="button"
                  className="button"
                  disabled={disabled || busy}
                  onClick={handleExecuteQuery}
                >
                  Run query
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={disabled || busy || !activeSavedQuery}
                  onClick={() =>
                    setExecutionDraft(buildSavedQueryExecutionDraft(activeSavedQuery))
                  }
                >
                  Reset params
                </button>
              </div>

              <div className="external-chip-list">
                {queryRuns.length === 0 ? (
                  <p className="panel__hint">No runs yet. Execute the query to get a live dataset.</p>
                ) : (
                  queryRuns.map((run) => (
                    <button
                      key={run.id}
                      type="button"
                      className={`saved-view-chip${run.id === selectedRun?.id ? ' is-active' : ''}`}
                      disabled={disabled || busy}
                      onClick={() => setSelectedRunId(run.id)}
                    >
                      <strong>{run.status === 'succeeded' ? `${run.rowCount} rows` : 'Failed'}</strong>
                      <span>{run.startedAt.slice(0, 19).replace('T', ' ')}</span>
                    </button>
                  ))
                )}
              </div>

              {canPublishOutputs && selectedRun?.status === 'succeeded' ? (
                <div className="external-publish-row">
                  <label className="field">
                    <span>Publish title</span>
                    <input
                      type="text"
                      value={publishTitle}
                      disabled={disabled || busy}
                      onChange={(event) => setPublishTitle(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="button"
                    disabled={disabled || busy || !selectedRun}
                    onClick={() =>
                      selectedRun &&
                      void Promise.resolve(
                        onPublishQueryRun(selectedRun.id, {
                          title: publishTitle.trim() || undefined,
                        }),
                      )
                    }
                  >
                    Publish to document
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>

        <section className="panel external-data-panel external-data-panel--result">
          <div className="panel__header">
            <h2>Dataset Result</h2>
            <span>
              {selectedRun
                ? `${selectedRun.rowCount} rows${selectedRun.truncated ? ' (limited)' : ''}`
                : 'No run selected'}
            </span>
          </div>

          {!selectedRun ? (
            <div className="canvas-empty">
              <strong>No dataset yet</strong>
              <p>Run a saved query to open its latest dataset inside the workspace.</p>
            </div>
          ) : selectedRun.status === 'failed' ? (
            <div className="canvas-empty">
              <strong>Run failed</strong>
              <p>{selectedRun.errorMessage ?? 'The external query could not be completed.'}</p>
            </div>
          ) : selectedRun.rows.length === 0 ? (
            <div className="canvas-empty">
              <strong>No rows returned</strong>
              <p>Adjust the query parameters or source data and run the query again.</p>
            </div>
          ) : (
            <div className="dataset-table__scroll">
              <table className="entity-table dataset-table">
                <thead>
                  <tr>
                    {selectedRun.columns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedRun.rows.map((row, index) => (
                    <tr key={`${selectedRun.id}-${index}`}>
                      {selectedRun.columns.map((column) => (
                        <td key={column.key}>{formatDatasetCellValue(row[column.key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
