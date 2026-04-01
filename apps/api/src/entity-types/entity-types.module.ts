import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { EntityTypesController } from './entity-types.controller';
import { EntityTypesService } from './entity-types.service';

@Module({
  imports: [DatabaseModule, WorkspacesModule],
  controllers: [EntityTypesController],
  providers: [EntityTypesService],
  exports: [EntityTypesService],
})
export class EntityTypesModule {}
