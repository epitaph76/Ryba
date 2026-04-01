import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  createEntityTypeRequestSchema,
  entityTypeIdParamsSchema,
  listEntityTypesResponseSchema,
  updateEntityTypeRequestSchema,
  workspaceIdParamsSchema,
} from '@ryba/schemas';
import type { ApiEnvelope, EntityTypeRecord } from '@ryba/types';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { envelope } from '../common/api-response';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EntityTypesService } from './entity-types.service';

type WorkspaceIdParams = z.infer<typeof workspaceIdParamsSchema>;
type EntityTypeIdParams = z.infer<typeof entityTypeIdParamsSchema>;
type CreateEntityTypeRequest = z.infer<typeof createEntityTypeRequestSchema>;
type UpdateEntityTypeRequest = z.infer<typeof updateEntityTypeRequestSchema>;
type ListEntityTypesResponse = z.infer<typeof listEntityTypesResponseSchema>;

@ApiTags('entity-types')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class EntityTypesController {
  constructor(
    @Inject(EntityTypesService)
    private readonly entityTypesService: EntityTypesService,
  ) {}

  @Get('workspaces/:workspaceId/entity-types')
  async listEntityTypes(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(workspaceIdParamsSchema))
    params: WorkspaceIdParams,
  ): Promise<ApiEnvelope<ListEntityTypesResponse>> {
    const items = await this.entityTypesService.listEntityTypes(user.userId, params);

    return envelope({
      items,
    });
  }

  @Post('workspaces/:workspaceId/entity-types')
  async createEntityType(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(workspaceIdParamsSchema))
    params: WorkspaceIdParams,
    @Body(new ZodValidationPipe(createEntityTypeRequestSchema))
    payload: CreateEntityTypeRequest,
  ): Promise<ApiEnvelope<EntityTypeRecord>> {
    const entityType = await this.entityTypesService.createEntityType(user.userId, params, payload);

    return envelope(entityType);
  }

  @Patch('entity-types/:entityTypeId')
  async updateEntityType(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(entityTypeIdParamsSchema))
    params: EntityTypeIdParams,
    @Body(new ZodValidationPipe(updateEntityTypeRequestSchema))
    payload: UpdateEntityTypeRequest,
  ): Promise<ApiEnvelope<EntityTypeRecord>> {
    const entityType = await this.entityTypesService.updateEntityType(user.userId, params, payload);

    return envelope(entityType);
  }
}
