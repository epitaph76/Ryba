import { Module } from '@nestjs/common';

import { WorkspacesModule } from '../workspaces/workspaces.module';
import { RelationsController } from './relations.controller';
import { RelationsService } from './relations.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [RelationsController],
  providers: [RelationsService],
})
export class RelationsModule {}
