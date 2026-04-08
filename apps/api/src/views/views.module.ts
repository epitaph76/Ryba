import { Module } from '@nestjs/common';

import { GroupsModule } from '../groups/groups.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ViewsController } from './views.controller';
import { ViewsService } from './views.service';

@Module({
  imports: [WorkspacesModule, GroupsModule],
  controllers: [ViewsController],
  providers: [ViewsService],
})
export class ViewsModule {}
