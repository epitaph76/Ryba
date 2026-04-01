import { Module } from '@nestjs/common';

import { EntityTypesModule } from '../entity-types/entity-types.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { EntitiesController } from './entities.controller';
import { EntitiesService } from './entities.service';

@Module({
  imports: [WorkspacesModule, EntityTypesModule],
  controllers: [EntitiesController],
  providers: [EntitiesService],
  exports: [EntitiesService],
})
export class EntitiesModule {}
