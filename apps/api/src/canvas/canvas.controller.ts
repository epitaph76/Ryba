import { Body, Controller, Get, Inject, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  groupIdParamsSchema,
  saveCanvasStateRequestSchema,
  spaceIdParamsSchema,
} from '@ryba/schemas';
import type { ApiEnvelope, CanvasStateRecord } from '@ryba/types';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { envelope } from '../common/api-response';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CanvasService } from './canvas.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type GroupIdParams = z.infer<typeof groupIdParamsSchema>;
type SaveCanvasStateRequest = z.infer<typeof saveCanvasStateRequestSchema>;

@ApiTags('canvas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CanvasController {
  constructor(@Inject(CanvasService) private readonly canvasService: CanvasService) {}

  @Get('spaces/:spaceId/canvas')
  async getCanvasState(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(spaceIdParamsSchema))
    params: SpaceIdParams,
  ): Promise<ApiEnvelope<CanvasStateRecord>> {
    const canvasState = await this.canvasService.getCanvasState(user.userId, params);

    return envelope(canvasState);
  }

  @Get('groups/:groupId/canvas')
  async getGroupCanvasState(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(groupIdParamsSchema))
    params: GroupIdParams,
  ): Promise<ApiEnvelope<CanvasStateRecord>> {
    const canvasState = await this.canvasService.getGroupCanvasState(user.userId, params);

    return envelope(canvasState);
  }

  @Put('spaces/:spaceId/canvas')
  async saveCanvasState(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(spaceIdParamsSchema))
    params: SpaceIdParams,
    @Body(new ZodValidationPipe(saveCanvasStateRequestSchema))
    payload: SaveCanvasStateRequest,
  ): Promise<ApiEnvelope<CanvasStateRecord>> {
    const canvasState = await this.canvasService.saveCanvasState(user.userId, params, payload);

    return envelope(canvasState);
  }

  @Put('groups/:groupId/canvas')
  async saveGroupCanvasState(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(groupIdParamsSchema))
    params: GroupIdParams,
    @Body(new ZodValidationPipe(saveCanvasStateRequestSchema))
    payload: SaveCanvasStateRequest,
  ): Promise<ApiEnvelope<CanvasStateRecord>> {
    const canvasState = await this.canvasService.saveGroupCanvasState(user.userId, params, payload);

    return envelope(canvasState);
  }
}
