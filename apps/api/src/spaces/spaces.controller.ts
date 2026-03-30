import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  createSpaceRequestSchema,
  listSpacesResponseSchema,
  workspaceIdParamsSchema,
} from '@ryba/schemas';
import type { ApiEnvelope, SpaceRecord } from '@ryba/types';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { envelope } from '../common/api-response';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SpacesService } from './spaces.service';

type WorkspaceIdParams = z.infer<typeof workspaceIdParamsSchema>;
type CreateSpaceRequest = z.infer<typeof createSpaceRequestSchema>;
type ListSpacesResponse = z.infer<typeof listSpacesResponseSchema>;

@ApiTags('spaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces/:workspaceId/spaces')
export class SpacesController {
  constructor(@Inject(SpacesService) private readonly spacesService: SpacesService) {}

  @Post()
  async createSpace(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(workspaceIdParamsSchema))
    params: WorkspaceIdParams,
    @Body(new ZodValidationPipe(createSpaceRequestSchema))
    payload: CreateSpaceRequest,
  ): Promise<ApiEnvelope<SpaceRecord>> {
    const space = await this.spacesService.createSpace(user.userId, params, payload);

    return envelope(space);
  }

  @Get()
  async listSpaces(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(workspaceIdParamsSchema))
    params: WorkspaceIdParams,
  ): Promise<ApiEnvelope<ListSpacesResponse>> {
    const items = await this.spacesService.listSpaces(user.userId, params);

    return envelope({
      items,
    });
  }
}
