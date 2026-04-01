import { config as loadEnv } from 'dotenv';
import path from 'node:path';

import { apiEnvironmentSchema, type ApiEnvironment } from '@ryba/schemas';

loadEnv({
  path: [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '..', '..', '.env'),
  ],
});

export const apiEnvironment: ApiEnvironment = apiEnvironmentSchema.parse(process.env);
