import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database.module';
import { WorkspaceActivityService } from './workspace-activity.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  imports: [DatabaseModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceActivityService],
  exports: [WorkspacesService, WorkspaceActivityService],
})
export class WorkspacesModule {}
