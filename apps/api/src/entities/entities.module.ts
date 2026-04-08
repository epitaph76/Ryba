import { Module } from '@nestjs/common';

import { EntityTypesModule } from '../entity-types/entity-types.module';
import { GroupsModule } from '../groups/groups.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { EntitiesController } from './entities.controller';
import { EntitiesService } from './entities.service';

@Module({
  imports: [WorkspacesModule, EntityTypesModule, GroupsModule],
  controllers: [EntitiesController],
  providers: [EntitiesService],
  exports: [EntitiesService],
})
export class EntitiesModule {}
