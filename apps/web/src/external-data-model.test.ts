import { describe, expect, it } from 'vitest';
import type { QueryRunRecord, SavedQueryRecord } from '@ryba/types';

import {
  buildQueryRunSummary,
  buildSavedQueryEditorDraft,
  buildSavedQueryExecutionDraft,
  createEmptySavedQueryEditorDraft,
  createEmptySavedQueryParameterDraft,
  formatDatasetCellValue,
  serializeSavedQueryEditorDraft,
  serializeSavedQueryExecutionInput,
} from './external-data-model';

const savedQuery: SavedQueryRecord = {
  id: 'query-1',
  workspaceId: 'workspace-1',
  spaceId: 'space-1',
  groupId: null,
  dataSourceId: 'source-1',
  name: 'Overdue invoices',
  description: 'Rows for collections',
  sqlTemplate: 'select * from invoice_snapshots where status = {{status}} and company_id = {{company_id}}',
  parameterDefinitions: [
    {
      name: 'status',
      label: 'Status',
      type: 'text',
      required: true,
      description: null,
      defaultValue: 'overdue',
    },
    {
      name: 'company_id',
      label: 'Company',
      type: 'number',
      required: false,
      description: null,
      defaultValue: 42,
    },
  ],
  createdByUserId: 'user-1',
  updatedByUserId: 'user-1',
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
};

describe('external-data-model', () => {
  it('creates empty drafts with a preselected data source', () => {
    expect(createEmptySavedQueryEditorDraft('source-1')).toEqual({
      name: '',
      description: '',
      dataSourceId: 'source-1',
      sqlTemplate: '',
      parameterDefinitions: [],
    });
    expect(createEmptySavedQueryParameterDraft()).toEqual({
      name: '',
      label: '',
      type: 'text',
      required: false,
      description: '',
      defaultValue: '',
    });
  });

  it('restores and serializes a saved query draft', () => {
    const draft = buildSavedQueryEditorDraft(savedQuery);
    const serialized = serializeSavedQueryEditorDraft(draft);

    expect(draft.parameterDefinitions[0]?.defaultValue).toBe('overdue');
    expect(draft.parameterDefinitions[1]?.defaultValue).toBe('42');
    expect(serialized).toEqual({
      name: 'Overdue invoices',
      description: 'Rows for collections',
      dataSourceId: 'source-1',
      sqlTemplate: 'select * from invoice_snapshots where status = {{status}} and company_id = {{company_id}}',
      parameterDefinitions: [
        {
          name: 'status',
          label: 'Status',
          type: 'text',
          required: true,
          description: null,
          defaultValue: 'overdue',
        },
        {
          name: 'company_id',
          label: 'Company',
          type: 'number',
          required: false,
          description: null,
          defaultValue: 42,
        },
      ],
    });
  });

  it('builds and serializes execution parameters', () => {
    const executionDraft = buildSavedQueryExecutionDraft(savedQuery);

    expect(executionDraft).toEqual({
      status: 'overdue',
      company_id: '42',
    });
    expect(
      serializeSavedQueryExecutionInput(savedQuery, {
        status: 'paid',
        company_id: '12',
      }),
    ).toEqual({
      parameters: {
        status: 'paid',
        company_id: 12,
      },
    });
  });

  it('formats dataset cells and run summary', () => {
    const run: QueryRunRecord = {
      id: 'run-1',
      workspaceId: 'workspace-1',
      spaceId: 'space-1',
      groupId: null,
      savedQueryId: 'query-1',
      dataSourceId: 'source-1',
      actorUserId: 'user-1',
      status: 'succeeded',
      parameters: {},
      rowCount: 100,
      truncated: true,
      columns: [],
      rows: [],
      errorMessage: null,
      durationMs: 123,
      startedAt: '2026-04-01T00:00:00.000Z',
      finishedAt: '2026-04-01T00:00:01.000Z',
    };

    expect(formatDatasetCellValue({ nested: true })).toBe('{"nested":true}');
    expect(formatDatasetCellValue(null)).toBe('Empty');
    expect(buildQueryRunSummary(run)).toBe('Showing 100 rows within the current limit.');
  });
});
