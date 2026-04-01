import { Module } from '@nestjs/common';

import { WorkspacesModule } from '../workspaces/workspaces.module';
import { CanvasController } from './canvas.controller';
import { CanvasService } from './canvas.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [CanvasController],
  providers: [CanvasService],
})
export class CanvasModule {}
