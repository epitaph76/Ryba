import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DataSourcesController } from './data-sources.controller';
import { DataSourcesService } from './data-sources.service';

@Module({
  imports: [DatabaseModule, WorkspacesModule],
  controllers: [DataSourcesController],
  providers: [DataSourcesService],
  exports: [DataSourcesService],
})
export class DataSourcesModule {}
