import { z } from 'zod';

const idSchema = z.string().min(1).max(128);
const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
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

export const workspaceRoleSchema = z.enum(['owner', 'member']);

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

export const spaceRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  createdByUserId: idSchema,
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const entityRecordSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  spaceId: idSchema,
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

export const createEntityRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(4000).nullable().optional(),
  properties: jsonObjectSchema.optional(),
});

export const updateEntityRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    summary: z.string().max(4000).nullable().optional(),
    properties: jsonObjectSchema.optional(),
  })
  .refine((value) => value.title !== undefined || value.summary !== undefined || value.properties !== undefined, {
    message: 'At least one field must be provided',
  });

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

export const spaceIdParamsSchema = z.object({
  spaceId: idSchema,
});

export const entityIdParamsSchema = z.object({
  entityId: idSchema,
});

export const relationIdParamsSchema = z.object({
  relationId: idSchema,
});

export const listWorkspacesResponseSchema = z.object({
  items: z.array(workspaceRecordSchema),
});

export const listSpacesResponseSchema = z.object({
  items: z.array(spaceRecordSchema),
});

export const listEntitiesResponseSchema = z.object({
  items: z.array(entityRecordSchema),
});

export const listRelationsResponseSchema = z.object({
  items: z.array(relationRecordSchema),
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
});

export const documentBlockSchema = z.object({
  id: idSchema,
  kind: z.enum(['paragraph', 'heading', 'list_item', 'entity_reference']),
  text: z.string().nullable(),
  entityReferences: z.array(documentEntityReferenceSchema),
});
