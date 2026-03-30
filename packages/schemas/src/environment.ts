import { z } from 'zod';

export const apiEnvironmentSchema = z
  .object({
    API_PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.string().min(1).optional(),
  })
  .passthrough();

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
