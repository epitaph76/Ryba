import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  createDataSourceRequestSchema,
  listDataSourcesResponseSchema,
  workspaceIdParamsSchema,
} from '@ryba/schemas';
import type { ApiEnvelope, DataSourceRecord } from '@ryba/types';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { envelope } from '../common/api-response';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DataSourcesService } from './data-sources.service';

type WorkspaceIdParams = z.infer<typeof workspaceIdParamsSchema>;
type CreateDataSourceRequest = z.infer<typeof createDataSourceRequestSchema>;
type ListDataSourcesResponse = z.infer<typeof listDataSourcesResponseSchema>;

@ApiTags('data-sources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class DataSourcesController {
  constructor(
    @Inject(DataSourcesService)
    private readonly dataSourcesService: DataSourcesService,
  ) {}

  @Get('workspaces/:workspaceId/data-sources')
  async listDataSources(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(workspaceIdParamsSchema))
    params: WorkspaceIdParams,
  ): Promise<ApiEnvelope<ListDataSourcesResponse>> {
    const items = await this.dataSourcesService.listDataSources(user.userId, params);

    return envelope({
      items,
    });
  }

  @Post('workspaces/:workspaceId/data-sources')
  async createDataSource(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(workspaceIdParamsSchema))
    params: WorkspaceIdParams,
    @Body(new ZodValidationPipe(createDataSourceRequestSchema))
    payload: CreateDataSourceRequest,
  ): Promise<ApiEnvelope<DataSourceRecord>> {
    const record = await this.dataSourcesService.createDataSource(user.userId, params, payload);

    return envelope(record);
  }
}
