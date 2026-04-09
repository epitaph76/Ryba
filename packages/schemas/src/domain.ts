import { z } from 'zod';

const idSchema = z.string().min(1).max(128);
const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const fieldKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/);
const displayNameSchema = z.string().trim().min(1).max(120);

export const jsonObjectSchema = z.record(z.unknown());

export const apiMetaSchema = z.object({
  timestamp: z.string().min(1),
  requestId: z.string().optional(),
});

export const apiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'INTERNAL_ERROR',
]);

export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string().min(1),
  details: jsonObjectSchema.optional(),
});

export const apiEnvelopeSchema = <TData extends z.ZodTypeAny>(dataSchema: TData) =>
  z.union([
    z.object({
      ok: z.literal(true),
      data: dataSchema,
      meta: apiMetaSchema.optional(),
    }),
    z.object({
      ok: z.literal(false),
      error: apiErrorSchema,
      meta: apiMetaSchema.optional(),
    }),
  ]);

export const userRecordSchema = z.object({
  id: idSchema,
  email: z.string().email(),
  displayName: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const workspaceRoleSchema = z.enum(['owner', 'editor', 'viewer']);
export const workspaceAssignableRoleSchema = z.enum(['editor', 'viewer']);

export const workspaceRecordSchema = z.object({
  id: idSchema,
  ownerUserId: idSchema,
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const workspaceMemberRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  userId: idSchema,
  role: workspaceRoleSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const workspaceMemberDetailRecordSchema = workspaceMemberRecordSchema.extend({
  user: userRecordSchema.pick({
    id: true,
    email: true,
    displayName: true,
  }),
});

export const spaceRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  createdByUserId: idSchema,
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const groupRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  spaceId: idSchema,
  createdByUserId: idSchema,
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  description: z.string().max(4000).nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const entityFieldTypeSchema = z.enum([
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
]);

export const entityFieldOptionSchema = z.object({
  value: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  color: z.string().trim().min(1).max(32).nullable(),
});

export const entityTypeFieldRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  entityTypeId: idSchema,
  key: fieldKeySchema,
  label: z.string().trim().min(1).max(120),
  fieldType: entityFieldTypeSchema,
  description: z.string().max(4000).nullable(),
  required: z.boolean(),
  order: z.number().int().nonnegative(),
  config: jsonObjectSchema.default({}),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const entityTypeRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  description: z.string().max(4000).nullable(),
  color: z.string().trim().min(1).max(32).nullable(),
  icon: z.string().trim().min(1).max(64).nullable(),
  isSystem: z.boolean(),
  fields: z.array(entityTypeFieldRecordSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const entityRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  spaceId: idSchema,
  groupId: idSchema.nullable(),
  entityTypeId: idSchema.nullable(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(4000).nullable(),
  properties: jsonObjectSchema.default({}),
  createdByUserId: idSchema,
  updatedByUserId: idSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const relationRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  spaceId: idSchema,
  groupId: idSchema.nullable(),
  fromEntityId: idSchema,
  toEntityId: idSchema,
  relationType: z.string().trim().min(1).max(80),
  properties: jsonObjectSchema.default({}),
  createdByUserId: idSchema,
  updatedByUserId: idSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const authSessionSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
  user: userRecordSchema,
});

export const registerRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: displayNameSchema.optional(),
});

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const createWorkspaceRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
});

export const createSpaceRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
});

export const createGroupRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  description: z.string().max(4000).nullable().optional(),
});

export const createEntityRequestSchema = z.object({
  entityTypeId: idSchema.optional(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(4000).nullable().optional(),
  properties: jsonObjectSchema.optional(),
});

export const updateEntityRequestSchema = z
  .object({
    entityTypeId: idSchema.nullable().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    summary: z.string().max(4000).nullable().optional(),
    properties: jsonObjectSchema.optional(),
  })
  .refine(
    (value) =>
      value.entityTypeId !== undefined ||
      value.title !== undefined ||
      value.summary !== undefined ||
      value.properties !== undefined,
    {
      message: 'At least one field must be provided',
    },
  );

export const createRelationRequestSchema = z.object({
  fromEntityId: idSchema,
  toEntityId: idSchema,
  relationType: z.string().trim().min(1).max(80),
  properties: jsonObjectSchema.optional(),
});

export const updateRelationRequestSchema = z
  .object({
    relationType: z.string().trim().min(1).max(80).optional(),
    properties: jsonObjectSchema.optional(),
  })
  .refine((value) => value.relationType !== undefined || value.properties !== undefined, {
    message: 'At least one field must be provided',
  });

export const workspaceIdParamsSchema = z.object({
  workspaceId: idSchema,
});

export const workspaceMemberIdParamsSchema = z.object({
  membershipId: idSchema,
});

export const spaceIdParamsSchema = z.object({
  spaceId: idSchema,
});

export const groupIdParamsSchema = z.object({
  groupId: idSchema,
});

export const entityIdParamsSchema = z.object({
  entityId: idSchema,
});

export const relationIdParamsSchema = z.object({
  relationId: idSchema,
});

export const entityTypeIdParamsSchema = z.object({
  entityTypeId: idSchema,
});

export const listWorkspacesResponseSchema = z.object({
  items: z.array(workspaceRecordSchema),
});

export const listWorkspaceMembersResponseSchema = z.object({
  items: z.array(workspaceMemberDetailRecordSchema),
});

export const listSpacesResponseSchema = z.object({
  items: z.array(spaceRecordSchema),
});

export const listGroupsResponseSchema = z.object({
  items: z.array(groupRecordSchema),
});

export const listEntitiesResponseSchema = z.object({
  items: z.array(entityRecordSchema),
});

export const listEntityTypesResponseSchema = z.object({
  items: z.array(entityTypeRecordSchema),
});

export const listRelationsResponseSchema = z.object({
  items: z.array(relationRecordSchema),
});

export const savedViewFieldSourceSchema = z.enum(['system', 'property']);

export const savedViewColumnConfigSchema = z.object({
  key: z.string().trim().min(1).max(120),
  source: savedViewFieldSourceSchema,
  visible: z.boolean(),
  width: z.number().int().positive().nullable(),
});

export const savedViewFilterOperatorSchema = z.enum([
  'contains',
  'equals',
  'not_equals',
  'gt',
  'gte',
  'lt',
  'lte',
  'is_empty',
  'is_not_empty',
]);

export const savedViewFilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);

export const savedViewFilterConfigSchema = z.object({
  id: idSchema,
  key: z.string().trim().min(1).max(120),
  source: savedViewFieldSourceSchema,
  operator: savedViewFilterOperatorSchema,
  value: savedViewFilterValueSchema,
});

export const savedViewSortDirectionSchema = z.enum(['asc', 'desc']);

export const savedViewSortConfigSchema = z.object({
  key: z.string().trim().min(1).max(120),
  source: savedViewFieldSourceSchema,
  direction: savedViewSortDirectionSchema,
});

export const savedViewConfigSchema = z.object({
  filters: z.array(savedViewFilterConfigSchema).default([]),
  sort: z.array(savedViewSortConfigSchema).default([]),
  columns: z.array(savedViewColumnConfigSchema).default([]),
});

export const savedViewTypeSchema = z.enum(['table', 'list']);

export const savedViewRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  spaceId: idSchema,
  groupId: idSchema.nullable(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(4000).nullable(),
  entityTypeId: idSchema.nullable(),
  viewType: savedViewTypeSchema,
  config: savedViewConfigSchema,
  createdByUserId: idSchema,
  updatedByUserId: idSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const createSavedViewRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(4000).nullable().optional(),
  entityTypeId: idSchema.nullable().optional(),
  viewType: savedViewTypeSchema,
  config: savedViewConfigSchema,
});

export const updateSavedViewRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(4000).nullable().optional(),
    entityTypeId: idSchema.nullable().optional(),
    viewType: savedViewTypeSchema.optional(),
    config: savedViewConfigSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.entityTypeId !== undefined ||
      value.viewType !== undefined ||
      value.config !== undefined,
    {
      message: 'At least one field must be provided',
    },
  );

export const savedViewIdParamsSchema = z.object({
  savedViewId: idSchema,
});

export const listSavedViewsResponseSchema = z.object({
  items: z.array(savedViewRecordSchema),
});

export const inviteWorkspaceMemberRequestSchema = z.object({
  email: z.string().email(),
  role: workspaceAssignableRoleSchema,
});

export const updateWorkspaceMemberRoleRequestSchema = z.object({
  role: workspaceAssignableRoleSchema,
});

export const activityActorRecordSchema = userRecordSchema.pick({
  id: true,
  email: true,
  displayName: true,
});

export const activityEventRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  spaceId: idSchema.nullable(),
  groupId: idSchema.nullable(),
  actorUserId: idSchema,
  eventType: z.string().trim().min(1).max(120),
  targetType: z.string().trim().min(1).max(120),
  targetId: idSchema,
  summary: z.string().trim().min(1).max(4000),
  metadata: jsonObjectSchema.default({}),
  createdAt: z.string().min(1),
  actor: activityActorRecordSchema,
});

export const listActivityEventsResponseSchema = z.object({
  items: z.array(activityEventRecordSchema),
});

export const entityTypeFieldInputSchema = z.object({
  id: idSchema.optional(),
  key: fieldKeySchema,
  label: z.string().trim().min(1).max(120),
  fieldType: entityFieldTypeSchema,
  description: z.string().max(4000).nullable().optional(),
  required: z.boolean().optional(),
  order: z.number().int().nonnegative().optional(),
  config: jsonObjectSchema.optional(),
});

export const createEntityTypeRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  description: z.string().max(4000).nullable().optional(),
  color: z.string().trim().min(1).max(32).nullable().optional(),
  icon: z.string().trim().min(1).max(64).nullable().optional(),
  fields: z.array(entityTypeFieldInputSchema).default([]),
});

export const updateEntityTypeRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: slugSchema.optional(),
    description: z.string().max(4000).nullable().optional(),
    color: z.string().trim().min(1).max(32).nullable().optional(),
    icon: z.string().trim().min(1).max(64).nullable().optional(),
    fields: z.array(entityTypeFieldInputSchema).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.slug !== undefined ||
      value.description !== undefined ||
      value.color !== undefined ||
      value.icon !== undefined ||
      value.fields !== undefined,
    {
      message: 'At least one field must be provided',
    },
  );

export const entityDetailRecordSchema = z.object({
  entity: entityRecordSchema,
  entityType: entityTypeRecordSchema.nullable(),
  availableEntityTypes: z.array(entityTypeRecordSchema),
});

export const canvasPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const canvasSizeSchema = z.object({
  width: z.number(),
  height: z.number(),
});

export const canvasViewportSchema = z.object({
  zoom: z.number().positive(),
  offset: canvasPointSchema,
});

export const canvasNodeLayoutSchema = z.object({
  entityId: idSchema,
  position: canvasPointSchema,
  size: canvasSizeSchema.nullable(),
  zIndex: z.number().int(),
  collapsed: z.boolean(),
});

export const canvasEdgeLayoutSchema = z.object({
  relationId: idSchema,
  fromEntityId: idSchema,
  toEntityId: idSchema,
  controlPoints: z.array(canvasPointSchema),
});

export const canvasLayoutSchema = z.object({
  nodes: z.array(canvasNodeLayoutSchema),
  edges: z.array(canvasEdgeLayoutSchema),
  viewport: canvasViewportSchema,
});

export const canvasStateRecordSchema = z.object({
  spaceId: idSchema,
  groupId: idSchema.nullable(),
  nodes: z.array(canvasNodeLayoutSchema),
  edges: z.array(canvasEdgeLayoutSchema),
  viewport: canvasViewportSchema,
  updatedAt: z.string().min(1).nullable(),
});

export const saveCanvasStateRequestSchema = z.object({
  nodes: z.array(canvasNodeLayoutSchema),
  edges: z.array(canvasEdgeLayoutSchema),
  viewport: canvasViewportSchema,
});

export const documentEntityReferenceSchema = z.object({
  entityId: idSchema,
  label: z.string().nullable(),
  anchorId: z.string().nullable(),
  kind: z
    .enum(['entity_mention', 'document_link_definition', 'document_link_usage'])
    .optional(),
  linkKey: z.string().trim().min(1).max(129).nullable().optional(),
  definitionKey: z.string().trim().min(1).max(64).nullable().optional(),
  linkText: z.string().nullable().optional(),
  linkMode: z.enum(['static', 'sync']).nullable().optional(),
  sourceDocumentId: idSchema.nullable().optional(),
  sourceBlockId: z.string().trim().min(1).max(128).nullable().optional(),
  sourceGroupId: idSchema.nullable().optional(),
  sourceGroupSlug: slugSchema.nullable().optional(),
});

export const documentBlockSchema = z.object({
  id: idSchema,
  kind: z.enum(['paragraph', 'heading', 'list_item', 'entity_reference']),
  text: z.string().nullable(),
  entityReferences: z.array(documentEntityReferenceSchema),
});

export const documentRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  spaceId: idSchema,
  groupId: idSchema.nullable(),
  entityId: idSchema,
  title: z.string().trim().min(1).max(200),
  body: z.array(documentBlockSchema),
  previewText: z.string().max(4000),
  createdByUserId: idSchema,
  updatedByUserId: idSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const documentEntityPreviewSchema = z.object({
  entityId: idSchema,
  label: z.string().nullable(),
  anchorId: z.string().nullable(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(4000).nullable(),
  entityTypeId: idSchema.nullable(),
  groupId: idSchema.nullable(),
  groupSlug: slugSchema.nullable(),
});

export const documentDetailRecordSchema = z.object({
  document: documentRecordSchema,
  entity: z.object({
    id: idSchema,
    title: z.string().trim().min(1).max(200),
    summary: z.string().max(4000).nullable(),
    entityTypeId: idSchema.nullable(),
  }),
  mentions: z.array(documentEntityReferenceSchema),
  mentionedEntities: z.array(documentEntityPreviewSchema),
});

export const documentBacklinkRecordSchema = z.object({
  entityId: idSchema,
  sourceEntityId: idSchema,
  documentId: idSchema,
  documentTitle: z.string().trim().min(1).max(200),
  label: z.string().nullable(),
  anchorId: z.string().nullable(),
  previewText: z.string().max(4000),
  updatedAt: z.string().min(1),
  sourceGroupId: idSchema.nullable(),
  sourceGroupSlug: slugSchema.nullable(),
});

export const createDocumentRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.array(documentBlockSchema).default([]),
});

export const upsertEntityDocumentRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.array(documentBlockSchema).default([]),
  })
  .refine((value) => value.title !== undefined || value.body !== undefined, {
    message: 'At least one field must be provided',
  });

export const updateDocumentRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.array(documentBlockSchema).optional(),
  })
  .refine((value) => value.title !== undefined || value.body !== undefined, {
    message: 'At least one field must be provided',
  });

export const documentIdParamsSchema = z.object({
  documentId: idSchema,
});

export const listDocumentsResponseSchema = z.object({
  items: z.array(documentRecordSchema),
});

export const listDocumentBacklinksResponseSchema = z.object({
  items: z.array(documentBacklinkRecordSchema),
});
