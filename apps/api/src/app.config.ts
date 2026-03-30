import { config as loadEnv } from 'dotenv';

import { apiEnvironmentSchema, type ApiEnvironment } from '@ryba/schemas';

loadEnv();

export const apiEnvironment: ApiEnvironment = apiEnvironmentSchema.parse(process.env);
