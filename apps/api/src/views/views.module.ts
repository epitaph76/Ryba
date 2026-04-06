import { Module } from '@nestjs/common';

import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ViewsController } from './views.controller';
import { ViewsService } from './views.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [ViewsController],
  providers: [ViewsService],
})
export class ViewsModule {}
