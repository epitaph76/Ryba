import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [DatabaseModule, WorkspacesModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
