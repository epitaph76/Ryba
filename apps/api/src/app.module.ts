import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { CanvasModule } from './canvas/canvas.module';
import { DatabaseModule } from './database.module';
import { DocumentsModule } from './documents/documents.module';
import { EntitiesModule } from './entities/entities.module';
import { EntityTypesModule } from './entity-types/entity-types.module';
import { GroupsModule } from './groups/groups.module';
import { HealthController } from './health.controller';
import { RelationsModule } from './relations/relations.module';
import { SpacesModule } from './spaces/spaces.module';
import { ViewsModule } from './views/views.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    CanvasModule,
    DocumentsModule,
    GroupsModule,
    WorkspacesModule,
    SpacesModule,
    ViewsModule,
    EntityTypesModule,
    EntitiesModule,
    RelationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
