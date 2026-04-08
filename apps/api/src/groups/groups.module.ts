import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [DatabaseModule, WorkspacesModule],
  providers: [GroupsService],
  controllers: [GroupsController],
  exports: [GroupsService],
})
export class GroupsModule {}
