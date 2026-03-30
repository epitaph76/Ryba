import { Module } from '@nestjs/common';

import { WorkspacesModule } from '../workspaces/workspaces.module';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [SpacesController],
  providers: [SpacesService],
  exports: [SpacesService],
})
export class SpacesModule {}
