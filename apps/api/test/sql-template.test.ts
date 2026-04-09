import { describe, expect, it } from 'vitest';
import type { SavedQueryParameterDefinition } from '@ryba/types';

import {
  coerceSavedQueryParameterValues,
  compileSavedQueryTemplate,
  SavedQueryValidationError,
  validateSavedQueryDefinition,
} from '../src/queries/sql-template';

const baseDefinitions: SavedQueryParameterDefinition[] = [
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
    defaultValue: null,
  },
];

describe('sql-template', () => {
  it('validates a safe parameterized select query', () => {
    expect(() =>
      validateSavedQueryDefinition(
        'select * from invoice_snapshots where status = {{status}} and company_id = {{company_id}}',
        baseDefinitions,
      ),
    ).not.toThrow();
  });

  it('rejects unsafe or multi-statement sql', () => {
    expect(() =>
      validateSavedQueryDefinition(
        'select * from invoice_snapshots; delete from invoice_snapshots',
        baseDefinitions,
      ),
    ).toThrow(SavedQueryValidationError);

    expect(() =>
      validateSavedQueryDefinition(
        'delete from invoice_snapshots where status = {{status}}',
        [baseDefinitions[0]!],
      ),
    ).toThrow(SavedQueryValidationError);
  });

  it('coerces parameter values and compiles repeated placeholders once', () => {
    const parameters = coerceSavedQueryParameterValues(baseDefinitions, {
      status: 'paid',
      company_id: '42',
    });
    const compiled = compileSavedQueryTemplate(
      'select * from invoice_snapshots where status = {{status}} or fallback_status = {{status}} and company_id = {{company_id}}',
      parameters,
    );

    expect(parameters).toEqual({
      status: 'paid',
      company_id: 42,
    });
    expect(compiled.text).toBe(
      'select * from invoice_snapshots where status = $1 or fallback_status = $1 and company_id = $2',
    );
    expect(compiled.values).toEqual(['paid', 42]);
  });

  it('uses default values for required parameters when they are defined', () => {
    expect(
      coerceSavedQueryParameterValues(baseDefinitions, {
        company_id: 7,
      }),
    ).toEqual({
      status: 'overdue',
      company_id: 7,
    });
  });

  it('requires values for required parameters when no default is defined', () => {
    expect(() =>
      coerceSavedQueryParameterValues(
        [
          {
            ...baseDefinitions[0]!,
            defaultValue: null,
          },
        ],
        {},
      ),
    ).toThrow(SavedQueryValidationError);
  });
});
