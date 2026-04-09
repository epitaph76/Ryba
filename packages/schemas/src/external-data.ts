import { z } from 'zod';

import {
  documentDetailRecordSchema,
  groupIdParamsSchema,
  jsonObjectSchema,
  spaceIdParamsSchema,
  workspaceIdParamsSchema,
} from './domain';

const idSchema = z.string().min(1).max(128);
const timestampSchema = z.string().min(1);

export const dataSourceKindSchema = z.literal('postgres');

export const dataSourceConnectionConfigSchema = z.object({
  connectionString: z.string().trim().min(1),
  host: z.string().trim().min(1),
  port: z.number().int().positive().nullable(),
  databaseName: z.string().trim().min(1),
  username: z.string().trim().min(1),
  sslMode: z.string().trim().min(1).nullable(),
});

export const dataSourceRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  kind: dataSourceKindSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(400).nullable(),
  host: z.string().trim().min(1),
  port: z.number().int().positive().nullable(),
  databaseName: z.string().trim().min(1),
  username: z.string().trim().min(1),
  sslMode: z.string().trim().min(1).nullable(),
  createdByUserId: idSchema,
  updatedByUserId: idSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const createDataSourceRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(400).nullable().optional(),
  connectionString: z.string().trim().min(1),
});

export const listDataSourcesResponseSchema = z.object({
  items: z.array(dataSourceRecordSchema),
});

export const dataSourceIdParamsSchema = z.object({
  dataSourceId: idSchema,
});

export const savedQueryParameterTypeSchema = z.enum(['text', 'number', 'boolean', 'date']);
export const savedQueryParameterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const savedQueryParameterDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  label: z.string().trim().min(1).max(120),
  type: savedQueryParameterTypeSchema,
  required: z.boolean().default(false),
  description: z.string().trim().max(240).nullable().default(null),
  defaultValue: savedQueryParameterValueSchema.default(null),
});

export const savedQueryRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  spaceId: idSchema,
  groupId: idSchema.nullable(),
  dataSourceId: idSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(400).nullable(),
  sqlTemplate: z.string().trim().min(1).max(20000),
  parameterDefinitions: z.array(savedQueryParameterDefinitionSchema),
  createdByUserId: idSchema,
  updatedByUserId: idSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const createSavedQueryRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(400).nullable().optional(),
  dataSourceId: idSchema,
  sqlTemplate: z.string().trim().min(1).max(20000),
  parameterDefinitions: z.array(savedQueryParameterDefinitionSchema).default([]),
});

export const updateSavedQueryRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(400).nullable().optional(),
    dataSourceId: idSchema.optional(),
    sqlTemplate: z.string().trim().min(1).max(20000).optional(),
    parameterDefinitions: z.array(savedQueryParameterDefinitionSchema).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const savedQueryIdParamsSchema = z.object({
  savedQueryId: idSchema,
});

export const listSavedQueriesResponseSchema = z.object({
  items: z.array(savedQueryRecordSchema),
});

export const savedQueryRuntimeParametersSchema = z.record(savedQueryParameterValueSchema);

export const executeSavedQueryRequestSchema = z.object({
  parameters: savedQueryRuntimeParametersSchema.default({}),
});

export const queryRunStatusSchema = z.enum(['succeeded', 'failed']);

export const queryResultColumnRecordSchema = z.object({
  key: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(160),
  dataType: z.string().trim().min(1).max(80),
});

export const queryResultRowsSchema = z.array(jsonObjectSchema);

export const queryRunRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  spaceId: idSchema,
  groupId: idSchema.nullable(),
  savedQueryId: idSchema,
  dataSourceId: idSchema,
  actorUserId: idSchema,
  status: queryRunStatusSchema,
  parameters: jsonObjectSchema.default({}),
  rowCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  columns: z.array(queryResultColumnRecordSchema),
  rows: queryResultRowsSchema,
  errorMessage: z.string().trim().max(2000).nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  startedAt: timestampSchema,
  finishedAt: timestampSchema.nullable(),
});

export const listQueryRunsResponseSchema = z.object({
  items: z.array(queryRunRecordSchema),
});

export const queryRunIdParamsSchema = z.object({
  queryRunId: idSchema,
});

export const publishQueryRunToDocumentRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
});

export const publishQueryRunToDocumentResponseSchema = documentDetailRecordSchema;

export {
  groupIdParamsSchema,
  spaceIdParamsSchema,
  workspaceIdParamsSchema,
};
