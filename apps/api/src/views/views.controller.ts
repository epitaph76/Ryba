import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  createSavedViewRequestSchema,
  listSavedViewsResponseSchema,
  savedViewIdParamsSchema,
  spaceIdParamsSchema,
  updateSavedViewRequestSchema,
} from '@ryba/schemas';
import type { ApiEnvelope, SavedViewRecord } from '@ryba/types';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { envelope } from '../common/api-response';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ViewsService } from './views.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type SavedViewIdParams = z.infer<typeof savedViewIdParamsSchema>;
type CreateSavedViewRequest = z.infer<typeof createSavedViewRequestSchema>;
type UpdateSavedViewRequest = z.infer<typeof updateSavedViewRequestSchema>;
type ListSavedViewsResponse = z.infer<typeof listSavedViewsResponseSchema>;

@ApiTags('saved-views')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ViewsController {
  constructor(@Inject(ViewsService) private readonly viewsService: ViewsService) {}

  @Get('spaces/:spaceId/saved-views')
  async listSavedViews(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(spaceIdParamsSchema))
    params: SpaceIdParams,
  ): Promise<ApiEnvelope<ListSavedViewsResponse>> {
    const items = await this.viewsService.listSavedViews(user.userId, params);

    return envelope({
      items,
    });
  }

  @Post('spaces/:spaceId/saved-views')
  async createSavedView(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(spaceIdParamsSchema))
    params: SpaceIdParams,
    @Body(new ZodValidationPipe(createSavedViewRequestSchema))
    payload: CreateSavedViewRequest,
  ): Promise<ApiEnvelope<SavedViewRecord>> {
    const view = await this.viewsService.createSavedView(user.userId, params, payload);

    return envelope(view);
  }

  @Patch('saved-views/:savedViewId')
  async updateSavedView(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(savedViewIdParamsSchema))
    params: SavedViewIdParams,
    @Body(new ZodValidationPipe(updateSavedViewRequestSchema))
    payload: UpdateSavedViewRequest,
  ): Promise<ApiEnvelope<SavedViewRecord>> {
    const view = await this.viewsService.updateSavedView(user.userId, params, payload);

    return envelope(view);
  }

  @Delete('saved-views/:savedViewId')
  async deleteSavedView(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(savedViewIdParamsSchema))
    params: SavedViewIdParams,
  ): Promise<ApiEnvelope<{ id: string }>> {
    const deleted = await this.viewsService.deleteSavedView(user.userId, params);

    return envelope(deleted);
  }
}
