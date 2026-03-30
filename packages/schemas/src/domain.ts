import { z } from 'zod';

export const jsonObjectSchema = z.record(z.unknown());

export const apiMetaSchema = z.object({
  timestamp: z.string(),
  requestId: z.string().optional(),
});

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
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

export const entityRecordSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  spaceId: z.string().min(1).nullable(),
  typeId: z.string().min(1).nullable(),
  title: z.string(),
  summary: z.string().nullable(),
  properties: jsonObjectSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const relationRecordSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  fromEntityId: z.string().min(1),
  toEntityId: z.string().min(1),
  relationType: z.string().min(1),
  properties: jsonObjectSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const canvasPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const canvasSizeSchema = z.object({
  width: z.number(),
  height: z.number(),
});

export const canvasNodeLayoutSchema = z.object({
  entityId: z.string().min(1),
  position: canvasPointSchema,
  size: canvasSizeSchema.nullable(),
  zIndex: z.number().int(),
  collapsed: z.boolean(),
});

export const canvasEdgeLayoutSchema = z.object({
  relationId: z.string().min(1),
  fromEntityId: z.string().min(1),
  toEntityId: z.string().min(1),
  controlPoints: z.array(canvasPointSchema),
});

export const documentEntityReferenceSchema = z.object({
  entityId: z.string().min(1),
  label: z.string().nullable(),
  anchorId: z.string().nullable(),
});

export const documentBlockSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['paragraph', 'heading', 'list_item', 'entity_reference']),
  text: z.string().nullable(),
  entityReferences: z.array(documentEntityReferenceSchema),
});
