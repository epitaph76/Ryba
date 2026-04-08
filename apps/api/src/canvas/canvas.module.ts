import { Module } from '@nestjs/common';

import { GroupsModule } from '../groups/groups.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { CanvasController } from './canvas.controller';
import { CanvasService } from './canvas.service';

@Module({
  imports: [WorkspacesModule, GroupsModule],
  controllers: [CanvasController],
  providers: [CanvasService],
})
export class CanvasModule {}
