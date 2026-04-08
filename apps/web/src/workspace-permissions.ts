import type { WorkspaceRole } from '@ryba/types';

export type WorkspaceCapabilities = {
  roleLabel: string;
  canRead: boolean;
  canEdit: boolean;
  canManage: boolean;
};

export const getWorkspaceCapabilities = (
  role: WorkspaceRole | null | undefined,
): WorkspaceCapabilities => {
  switch (role) {
    case 'owner':
      return {
        roleLabel: 'Owner',
        canRead: true,
        canEdit: true,
        canManage: true,
      };
    case 'editor':
      return {
        roleLabel: 'Editor',
        canRead: true,
        canEdit: true,
        canManage: false,
      };
    case 'viewer':
      return {
        roleLabel: 'Viewer',
        canRead: true,
        canEdit: false,
        canManage: false,
      };
    default:
      return {
        roleLabel: 'No access',
        canRead: false,
        canEdit: false,
        canManage: false,
      };
  }
};

export const formatWorkspaceRole = (role: WorkspaceRole | null | undefined) =>
  getWorkspaceCapabilities(role).roleLabel;
