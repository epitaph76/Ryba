import { z } from 'zod';

export const apiEnvironmentSchema = z
  .object({
    API_PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.string().min(1).optional(),
    JWT_SECRET: z.string().min(8).default('change-me'),
    JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(3600),
    API_CORS_ORIGIN: z.string().default('*'),
  })
  .passthrough();

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
