import { existsSync } from 'node:fs';
import path from 'node:path';

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

import { apiEnvironment } from './app.config';
import * as schema from './db/schema';

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
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  private readonly pool = apiEnvironment.DATABASE_URL
    ? new Pool({
        allowExitOnIdle: true,
        connectionString: apiEnvironment.DATABASE_URL,
      })
    : null;

  readonly db: NodePgDatabase<typeof schema> | null = this.pool
    ? drizzle(this.pool, { schema })
    : null;

  async onModuleInit(): Promise<void> {
    if (!this.db) {
      this.logger.warn('DATABASE_URL is not set, migrations are skipped');
      return;
    }

    const migrationsFolder = this.resolveMigrationsFolder();

    if (!migrationsFolder) {
      this.logger.warn('Migrations folder not found, startup migration step is skipped');
      return;
    }

    await migrate(this.db, { migrationsFolder });
  }

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

  private resolveMigrationsFolder(): string | null {
    const candidates = [
      path.resolve(process.cwd(), 'apps/api/drizzle'),
      path.resolve(process.cwd(), 'drizzle'),
    ];

    const hit = candidates.find((candidate) => existsSync(candidate));

    return hit ?? null;
  }
}
