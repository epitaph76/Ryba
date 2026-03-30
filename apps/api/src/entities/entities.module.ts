import { Module } from '@nestjs/common';

import { WorkspacesModule } from '../workspaces/workspaces.module';
import { EntitiesController } from './entities.controller';
import { EntitiesService } from './entities.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [EntitiesController],
  providers: [EntitiesService],
  exports: [EntitiesService],
})
export class EntitiesModule {}
