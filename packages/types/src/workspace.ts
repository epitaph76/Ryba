import type { UserId } from './user';

export type WorkspaceId = string;
export type WorkspaceMemberId = string;
export type SpaceId = string;
export type GroupId = string;

export type WorkspaceRole = 'owner' | 'member';

export interface WorkspaceRecord {
  id: WorkspaceId;
  ownerUserId: UserId;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMemberRecord {
  id: WorkspaceMemberId;
  workspaceId: WorkspaceId;
  userId: UserId;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
}

export interface SpaceRecord {
  id: SpaceId;
  workspaceId: WorkspaceId;
  createdByUserId: UserId;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroupRecord {
  id: GroupId;
  workspaceId: WorkspaceId;
  spaceId: SpaceId;
  createdByUserId: UserId;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
