import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  createWorkspaceRequestSchema,
  listWorkspacesResponseSchema,
} from '@ryba/schemas';
import type { ApiEnvelope, WorkspaceRecord } from '@ryba/types';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { envelope } from '../common/api-response';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WorkspacesService } from './workspaces.service';

type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;
type ListWorkspacesResponse = z.infer<typeof listWorkspacesResponseSchema>;

@ApiTags('workspaces')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService,
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
}
