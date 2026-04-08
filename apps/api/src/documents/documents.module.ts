import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database.module';
import { EntityTypesModule } from '../entity-types/entity-types.module';
import { GroupsModule } from '../groups/groups.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [DatabaseModule, EntityTypesModule, WorkspacesModule, GroupsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
