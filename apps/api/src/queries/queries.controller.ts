import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  createSavedQueryRequestSchema,
  executeSavedQueryRequestSchema,
  groupIdParamsSchema,
  listQueryRunsResponseSchema,
  listSavedQueriesResponseSchema,
  publishQueryRunToDocumentRequestSchema,
  queryRunIdParamsSchema,
  savedQueryIdParamsSchema,
  spaceIdParamsSchema,
  updateSavedQueryRequestSchema,
} from '@ryba/schemas';
import type {
  ApiEnvelope,
  DocumentDetailRecord,
  QueryRunRecord,
  SavedQueryRecord,
} from '@ryba/types';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { envelope } from '../common/api-response';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { QueriesService } from './queries.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type GroupIdParams = z.infer<typeof groupIdParamsSchema>;
type SavedQueryIdParams = z.infer<typeof savedQueryIdParamsSchema>;
type QueryRunIdParams = z.infer<typeof queryRunIdParamsSchema>;
type CreateSavedQueryRequest = z.infer<typeof createSavedQueryRequestSchema>;
type UpdateSavedQueryRequest = z.infer<typeof updateSavedQueryRequestSchema>;
type ExecuteSavedQueryRequest = z.infer<typeof executeSavedQueryRequestSchema>;
type PublishQueryRunToDocumentRequest = z.infer<typeof publishQueryRunToDocumentRequestSchema>;
type ListSavedQueriesResponse = z.infer<typeof listSavedQueriesResponseSchema>;
type ListQueryRunsResponse = z.infer<typeof listQueryRunsResponseSchema>;

@ApiTags('saved-queries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class QueriesController {
  constructor(@Inject(QueriesService) private readonly queriesService: QueriesService) {}

  @Get('spaces/:spaceId/saved-queries')
  async listSavedQueries(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(spaceIdParamsSchema))
    params: SpaceIdParams,
  ): Promise<ApiEnvelope<ListSavedQueriesResponse>> {
    const items = await this.queriesService.listSavedQueries(user.userId, params);

    return envelope({
      items,
    });
  }

  @Get('groups/:groupId/saved-queries')
  async listGroupSavedQueries(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(groupIdParamsSchema))
    params: GroupIdParams,
  ): Promise<ApiEnvelope<ListSavedQueriesResponse>> {
    const items = await this.queriesService.listGroupSavedQueries(user.userId, params);

    return envelope({
      items,
    });
  }

  @Post('spaces/:spaceId/saved-queries')
  async createSavedQuery(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(spaceIdParamsSchema))
    params: SpaceIdParams,
    @Body(new ZodValidationPipe(createSavedQueryRequestSchema))
    payload: CreateSavedQueryRequest,
  ): Promise<ApiEnvelope<SavedQueryRecord>> {
    const record = await this.queriesService.createSavedQuery(user.userId, params, payload);

    return envelope(record);
  }

  @Post('groups/:groupId/saved-queries')
  async createGroupSavedQuery(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(groupIdParamsSchema))
    params: GroupIdParams,
    @Body(new ZodValidationPipe(createSavedQueryRequestSchema))
    payload: CreateSavedQueryRequest,
  ): Promise<ApiEnvelope<SavedQueryRecord>> {
    const record = await this.queriesService.createGroupSavedQuery(user.userId, params, payload);

    return envelope(record);
  }

  @Patch('saved-queries/:savedQueryId')
  async updateSavedQuery(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(savedQueryIdParamsSchema))
    params: SavedQueryIdParams,
    @Body(new ZodValidationPipe(updateSavedQueryRequestSchema))
    payload: UpdateSavedQueryRequest,
  ): Promise<ApiEnvelope<SavedQueryRecord>> {
    const record = await this.queriesService.updateSavedQuery(user.userId, params, payload);

    return envelope(record);
  }

  @Delete('saved-queries/:savedQueryId')
  async deleteSavedQuery(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(savedQueryIdParamsSchema))
    params: SavedQueryIdParams,
  ): Promise<ApiEnvelope<{ id: string }>> {
    const deleted = await this.queriesService.deleteSavedQuery(user.userId, params);

    return envelope(deleted);
  }

  @Post('saved-queries/:savedQueryId/execute')
  @HttpCode(200)
  async executeSavedQuery(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(savedQueryIdParamsSchema))
    params: SavedQueryIdParams,
    @Body(new ZodValidationPipe(executeSavedQueryRequestSchema))
    payload: ExecuteSavedQueryRequest,
  ): Promise<ApiEnvelope<QueryRunRecord>> {
    const run = await this.queriesService.executeSavedQuery(user.userId, params, payload);

    return envelope(run);
  }

  @Get('saved-queries/:savedQueryId/runs')
  async listQueryRuns(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(savedQueryIdParamsSchema))
    params: SavedQueryIdParams,
  ): Promise<ApiEnvelope<ListQueryRunsResponse>> {
    const items = await this.queriesService.listQueryRuns(user.userId, params);

    return envelope({
      items,
    });
  }

  @Post('query-runs/:queryRunId/publish-document')
  @HttpCode(200)
  async publishQueryRunToDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(queryRunIdParamsSchema))
    params: QueryRunIdParams,
    @Body(new ZodValidationPipe(publishQueryRunToDocumentRequestSchema))
    payload: PublishQueryRunToDocumentRequest,
  ): Promise<ApiEnvelope<DocumentDetailRecord>> {
    const detail = await this.queriesService.publishQueryRunToDocument(
      user.userId,
      params,
      payload,
    );

    return envelope(detail);
  }
}
