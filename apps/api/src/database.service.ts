import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

import { apiEnvironment } from './app.config';

export interface DatabaseHealthOk {
  status: 'ok';
  timestamp: string;
  database: 'connected';
  query: { ok: number };
}

export interface DatabaseHealthUnhealthy {
  status: 'unhealthy';
  timestamp: string;
  database: 'not_configured' | 'unreachable';
  message: string;
}

export type DatabaseHealthResult = DatabaseHealthOk | DatabaseHealthUnhealthy;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = apiEnvironment.DATABASE_URL
    ? new Pool({
        allowExitOnIdle: true,
        connectionString: apiEnvironment.DATABASE_URL,
      })
    : null;

  async checkHealth(): Promise<DatabaseHealthResult> {
    const timestamp = new Date().toISOString();

    if (!this.pool) {
      return {
        status: 'unhealthy',
        timestamp,
        database: 'not_configured',
        message: 'DATABASE_URL is not set',
      };
    }

    try {
      const result = await this.pool.query('SELECT 1 AS ok');

      return {
        status: 'ok',
        timestamp,
        database: 'connected',
        query: {
          ok: Number(result.rows[0]?.ok ?? 1),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp,
        database: 'unreachable',
        message: error instanceof Error ? error.message : 'Unknown database error',
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
