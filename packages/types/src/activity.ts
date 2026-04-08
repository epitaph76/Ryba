import type { JsonObject } from './json';
import type { UserId } from './user';
import type { GroupId, SpaceId, WorkspaceId } from './workspace';

export type ActivityEventId = string;

export interface ActivityActorRecord {
  id: UserId;
  email: string;
  displayName: string | null;
}

export interface ActivityEventRecord {
  id: ActivityEventId;
  workspaceId: WorkspaceId;
  spaceId: SpaceId | null;
  groupId: GroupId | null;
  actorUserId: UserId;
  eventType: string;
  targetType: string;
  targetId: string;
  summary: string;
  metadata: JsonObject;
  createdAt: string;
  actor: ActivityActorRecord;
}
