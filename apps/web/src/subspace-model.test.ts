import { describe, expect, it } from 'vitest';

import { resolveActiveSubspace } from './subspace-model';

const groups = [
  {
    id: 'group-1',
    workspaceId: 'workspace-1',
    spaceId: 'space-1',
    createdByUserId: 'user-1',
    name: 'Enterprise Clients',
    slug: 'enterprise-clients',
    description: 'Deal room',
    createdAt: '2026-04-08T10:00:00.000Z',
    updatedAt: '2026-04-08T10:00:00.000Z',
  },
  {
    id: 'group-2',
    workspaceId: 'workspace-1',
    spaceId: 'space-2',
    createdByUserId: 'user-1',
    name: 'Launch Q3',
    slug: 'launch-q3',
    description: 'Launch subspace',
    createdAt: '2026-04-08T10:05:00.000Z',
    updatedAt: '2026-04-08T10:05:00.000Z',
  },
];

describe('subspace-model', () => {
  it('returns the outer space scope when no group is selected', () => {
    const scope = resolveActiveSubspace({
      spaceId: 'space-1',
      selectedGroupId: null,
      groups,
    });

    expect(scope.contextId).toBe('space:space-1');
    expect(scope.group).toBeNull();
    expect(scope.groupId).toBeNull();
  });

  it('returns the inner group scope when the selected group belongs to the current space', () => {
    const scope = resolveActiveSubspace({
      spaceId: 'space-1',
      selectedGroupId: 'group-1',
      groups,
    });

    expect(scope.contextId).toBe('group:group-1');
    expect(scope.group?.id).toBe('group-1');
    expect(scope.groupId).toBe('group-1');
  });

  it('falls back to the outer space when the selected group belongs to another space', () => {
    const scope = resolveActiveSubspace({
      spaceId: 'space-1',
      selectedGroupId: 'group-2',
      groups,
    });

    expect(scope.contextId).toBe('space:space-1');
    expect(scope.group).toBeNull();
    expect(scope.groupId).toBeNull();
  });
});
