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
  createRelationRequestSchema,
  groupIdParamsSchema,
  listRelationsResponseSchema,
  relationIdParamsSchema,
  spaceIdParamsSchema,
  updateRelationRequestSchema,
} from '@ryba/schemas';
import type { ApiEnvelope, RelationRecord } from '@ryba/types';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { envelope } from '../common/api-response';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RelationsService } from './relations.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type GroupIdParams = z.infer<typeof groupIdParamsSchema>;
type RelationIdParams = z.infer<typeof relationIdParamsSchema>;
type CreateRelationRequest = z.infer<typeof createRelationRequestSchema>;
type UpdateRelationRequest = z.infer<typeof updateRelationRequestSchema>;
type ListRelationsResponse = z.infer<typeof listRelationsResponseSchema>;

@ApiTags('relations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class RelationsController {
  constructor(
    @Inject(RelationsService) private readonly relationsService: RelationsService,
  ) {}

  @Post('spaces/:spaceId/relations')
  async createRelation(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(spaceIdParamsSchema))
    params: SpaceIdParams,
    @Body(new ZodValidationPipe(createRelationRequestSchema))
    payload: CreateRelationRequest,
  ): Promise<ApiEnvelope<RelationRecord>> {
    const relation = await this.relationsService.createRelation(user.userId, params, payload);

    return envelope(relation);
  }

  @Post('groups/:groupId/relations')
  async createGroupRelation(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(groupIdParamsSchema))
    params: GroupIdParams,
    @Body(new ZodValidationPipe(createRelationRequestSchema))
    payload: CreateRelationRequest,
  ): Promise<ApiEnvelope<RelationRecord>> {
    const relation = await this.relationsService.createGroupRelation(user.userId, params, payload);

    return envelope(relation);
  }

  @Get('spaces/:spaceId/relations')
  async listRelations(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(spaceIdParamsSchema))
    params: SpaceIdParams,
  ): Promise<ApiEnvelope<ListRelationsResponse>> {
    const items = await this.relationsService.listRelations(user.userId, params);

    return envelope({
      items,
    });
  }

  @Get('groups/:groupId/relations')
  async listGroupRelations(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(groupIdParamsSchema))
    params: GroupIdParams,
  ): Promise<ApiEnvelope<ListRelationsResponse>> {
    const items = await this.relationsService.listGroupRelations(user.userId, params);

    return envelope({
      items,
    });
  }

  @Patch('relations/:relationId')
  async updateRelation(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(relationIdParamsSchema))
    params: RelationIdParams,
    @Body(new ZodValidationPipe(updateRelationRequestSchema))
    payload: UpdateRelationRequest,
  ): Promise<ApiEnvelope<RelationRecord>> {
    const relation = await this.relationsService.updateRelation(user.userId, params, payload);

    return envelope(relation);
  }

  @Delete('relations/:relationId')
  async deleteRelation(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(relationIdParamsSchema))
    params: RelationIdParams,
  ): Promise<ApiEnvelope<{ id: string }>> {
    const deleted = await this.relationsService.deleteRelation(user.userId, params);

    return envelope(deleted);
  }
}
