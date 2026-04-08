import { describe, expect, it } from 'vitest';

import {
  formatWorkspaceRole,
  getWorkspaceCapabilities,
} from './workspace-permissions';

describe('workspace-permissions', () => {
  it('grants full access to owner', () => {
    expect(getWorkspaceCapabilities('owner')).toEqual({
      roleLabel: 'Owner',
      canRead: true,
      canEdit: true,
      canManage: true,
    });
  });

  it('allows editors to edit content but not manage workspace structure', () => {
    expect(getWorkspaceCapabilities('editor')).toEqual({
      roleLabel: 'Editor',
      canRead: true,
      canEdit: true,
      canManage: false,
    });
  });

  it('keeps viewers in read only mode', () => {
    expect(getWorkspaceCapabilities('viewer')).toEqual({
      roleLabel: 'Viewer',
      canRead: true,
      canEdit: false,
      canManage: false,
    });
  });

  it('formats missing role as no access', () => {
    expect(formatWorkspaceRole(null)).toBe('No access');
  });
});
