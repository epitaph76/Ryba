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
  createEntityRequestSchema,
  entityIdParamsSchema,
  listEntitiesResponseSchema,
  spaceIdParamsSchema,
  updateEntityRequestSchema,
} from '@ryba/schemas';
import type { ApiEnvelope, EntityRecord } from '@ryba/types';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { envelope } from '../common/api-response';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EntitiesService } from './entities.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type EntityIdParams = z.infer<typeof entityIdParamsSchema>;
type CreateEntityRequest = z.infer<typeof createEntityRequestSchema>;
type UpdateEntityRequest = z.infer<typeof updateEntityRequestSchema>;
type ListEntitiesResponse = z.infer<typeof listEntitiesResponseSchema>;

@ApiTags('entities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class EntitiesController {
  constructor(
    @Inject(EntitiesService) private readonly entitiesService: EntitiesService,
  ) {}

  @Post('spaces/:spaceId/entities')
  async createEntity(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(spaceIdParamsSchema))
    params: SpaceIdParams,
    @Body(new ZodValidationPipe(createEntityRequestSchema))
    payload: CreateEntityRequest,
  ): Promise<ApiEnvelope<EntityRecord>> {
    const entity = await this.entitiesService.createEntity(user.userId, params, payload);

    return envelope(entity);
  }

  @Get('spaces/:spaceId/entities')
  async listEntities(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(spaceIdParamsSchema))
    params: SpaceIdParams,
  ): Promise<ApiEnvelope<ListEntitiesResponse>> {
    const items = await this.entitiesService.listEntities(user.userId, params);

    return envelope({
      items,
    });
  }

  @Get('entities/:entityId')
  async getEntity(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(entityIdParamsSchema))
    params: EntityIdParams,
  ): Promise<ApiEnvelope<EntityRecord>> {
    const entity = await this.entitiesService.getEntity(user.userId, params);

    return envelope(entity);
  }

  @Patch('entities/:entityId')
  async updateEntity(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(entityIdParamsSchema))
    params: EntityIdParams,
    @Body(new ZodValidationPipe(updateEntityRequestSchema))
    payload: UpdateEntityRequest,
  ): Promise<ApiEnvelope<EntityRecord>> {
    const entity = await this.entitiesService.updateEntity(user.userId, params, payload);

    return envelope(entity);
  }

  @Delete('entities/:entityId')
  async deleteEntity(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(entityIdParamsSchema))
    params: EntityIdParams,
  ): Promise<ApiEnvelope<{ id: string }>> {
    const deleted = await this.entitiesService.deleteEntity(user.userId, params);

    return envelope(deleted);
  }
}
