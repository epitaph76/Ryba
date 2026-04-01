import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { EntityTypesModule } from '../entity-types/entity-types.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [DatabaseModule, EntityTypesModule, WorkspacesModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
