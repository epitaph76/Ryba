import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  createGroupRequestSchema,
  listGroupsResponseSchema,
  spaceIdParamsSchema,
} from '@ryba/schemas';
import type { ApiEnvelope, GroupRecord } from '@ryba/types';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { envelope } from '../common/api-response';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GroupsService } from './groups.service';

type SpaceIdParams = z.infer<typeof spaceIdParamsSchema>;
type CreateGroupRequest = z.infer<typeof createGroupRequestSchema>;
type ListGroupsResponse = z.infer<typeof listGroupsResponseSchema>;

@ApiTags('groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class GroupsController {
  constructor(@Inject(GroupsService) private readonly groupsService: GroupsService) {}

  @Post('spaces/:spaceId/groups')
  async createGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(spaceIdParamsSchema))
    params: SpaceIdParams,
    @Body(new ZodValidationPipe(createGroupRequestSchema))
    payload: CreateGroupRequest,
  ): Promise<ApiEnvelope<GroupRecord>> {
    const group = await this.groupsService.createGroup(user.userId, params, payload);

    return envelope(group);
  }

  @Get('spaces/:spaceId/groups')
  async listGroups(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(spaceIdParamsSchema))
    params: SpaceIdParams,
  ): Promise<ApiEnvelope<ListGroupsResponse>> {
    const items = await this.groupsService.listGroups(user.userId, params);

    return envelope({
      items,
    });
  }
}
