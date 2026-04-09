import { Module } from '@nestjs/common';

import { DataSourcesModule } from '../data-sources/data-sources.module';
import { DatabaseModule } from '../database.module';
import { DocumentsModule } from '../documents/documents.module';
import { GroupsModule } from '../groups/groups.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { QueriesController } from './queries.controller';
import { QueriesService } from './queries.service';

@Module({
  imports: [
    DatabaseModule,
    DataSourcesModule,
    DocumentsModule,
    GroupsModule,
    WorkspacesModule,
  ],
  controllers: [QueriesController],
  providers: [QueriesService],
})
export class QueriesModule {}
