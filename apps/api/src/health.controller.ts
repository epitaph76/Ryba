import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { DatabaseService, type DatabaseHealthResult } from './database.service';

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

@Controller()
export class HealthController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get('health')
  health(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('db/health')
  async dbHealth(): Promise<DatabaseHealthResult> {
    const result = await this.databaseService.checkHealth();

    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }
}
