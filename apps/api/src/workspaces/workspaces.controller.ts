import {
  Body,
  Controller,
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
  inviteWorkspaceMemberRequestSchema,
  listActivityEventsResponseSchema,
  listWorkspaceMembersResponseSchema,
  createWorkspaceRequestSchema,
  listWorkspacesResponseSchema,
  updateWorkspaceMemberRoleRequestSchema,
  workspaceIdParamsSchema,
  workspaceMemberIdParamsSchema,
} from '@ryba/schemas';
import type {
  ActivityEventRecord,
  ApiEnvelope,
  WorkspaceMemberDetailRecord,
  WorkspaceRecord,
} from '@ryba/types';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { envelope } from '../common/api-response';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WorkspaceActivityService } from './workspace-activity.service';
import { WorkspacesService } from './workspaces.service';

type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;
type ListWorkspacesResponse = z.infer<typeof listWorkspacesResponseSchema>;
type WorkspaceIdParams = z.infer<typeof workspaceIdParamsSchema>;
type WorkspaceMemberIdParams = z.infer<typeof workspaceMemberIdParamsSchema>;
type InviteWorkspaceMemberRequest = z.infer<typeof inviteWorkspaceMemberRequestSchema>;
type UpdateWorkspaceMemberRoleRequest = z.infer<typeof updateWorkspaceMemberRoleRequestSchema>;
type ListWorkspaceMembersResponse = z.infer<typeof listWorkspaceMembersResponseSchema>;
type ListActivityEventsResponse = z.infer<typeof listActivityEventsResponseSchema>;

@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
    @Inject(WorkspaceActivityService)
    private readonly workspaceActivityService: WorkspaceActivityService,
  ) {}

  @Post()
  async createWorkspace(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createWorkspaceRequestSchema))
    payload: CreateWorkspaceRequest,
  ): Promise<ApiEnvelope<WorkspaceRecord>> {
    const workspace = await this.workspacesService.createWorkspace(user.userId, payload);

    return envelope(workspace);
  }

  @Get()
  async listWorkspaces(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiEnvelope<ListWorkspacesResponse>> {
    const items = await this.workspacesService.listWorkspaces(user.userId);

    return envelope({
      items,
    });
  }

  @Get(':workspaceId/members')
  async listWorkspaceMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(workspaceIdParamsSchema))
    params: WorkspaceIdParams,
  ): Promise<ApiEnvelope<ListWorkspaceMembersResponse>> {
    const items = await this.workspacesService.listMembers(user.userId, params);

    return envelope({
      items,
    });
  }

  @Post(':workspaceId/members')
  async inviteWorkspaceMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(workspaceIdParamsSchema))
    params: WorkspaceIdParams,
    @Body(new ZodValidationPipe(inviteWorkspaceMemberRequestSchema))
    payload: InviteWorkspaceMemberRequest,
  ): Promise<ApiEnvelope<WorkspaceMemberDetailRecord>> {
    const member = await this.workspacesService.inviteMember(user.userId, params, payload);

    return envelope(member);
  }

  @Patch('members/:membershipId')
  async updateWorkspaceMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(workspaceMemberIdParamsSchema))
    params: WorkspaceMemberIdParams,
    @Body(new ZodValidationPipe(updateWorkspaceMemberRoleRequestSchema))
    payload: UpdateWorkspaceMemberRoleRequest,
  ): Promise<ApiEnvelope<WorkspaceMemberDetailRecord>> {
    const member = await this.workspacesService.updateMemberRole(user.userId, params, payload);

    return envelope(member);
  }

  @Get(':workspaceId/activity')
  async listWorkspaceActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param(new ZodValidationPipe(workspaceIdParamsSchema))
    params: WorkspaceIdParams,
  ): Promise<ApiEnvelope<ListActivityEventsResponse>> {
    await this.workspacesService.requirePermission(user.userId, params.workspaceId, 'read');
    const items = await this.workspaceActivityService.listWorkspaceActivity(params.workspaceId);

    return envelope({
      items,
    });
  }
}
