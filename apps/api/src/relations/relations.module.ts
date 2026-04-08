import { Module } from '@nestjs/common';

import { GroupsModule } from '../groups/groups.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { RelationsController } from './relations.controller';
import { RelationsService } from './relations.service';

@Module({
  imports: [WorkspacesModule, GroupsModule],
  controllers: [RelationsController],
  providers: [RelationsService],
})
export class RelationsModule {}
