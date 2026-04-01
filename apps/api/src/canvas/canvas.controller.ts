import { Body, Controller, Get, Inject, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
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
type SaveCanvasStateRequest = z.infer<typeof saveCanvasStateRequestSchema>;

@ApiTags('canvas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('spaces/:spaceId/canvas')
export class CanvasController {
  constructor(@Inject(CanvasService) private readonly canvasService: CanvasService) {}

  @Get()
  async getCanvasState(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(spaceIdParamsSchema))
    params: SpaceIdParams,
  ): Promise<ApiEnvelope<CanvasStateRecord>> {
    const canvasState = await this.canvasService.getCanvasState(user.userId, params);

    return envelope(canvasState);
  }

  @Put()
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
}
