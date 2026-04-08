import type { GroupRecord } from '@ryba/types';

export function resolveActiveSubspace(input: {
  spaceId: string;
  selectedGroupId: string | null;
  groups: GroupRecord[];
}) {
  const group =
    input.selectedGroupId
      ? input.groups.find(
          (candidate) =>
            candidate.id === input.selectedGroupId && candidate.spaceId === input.spaceId,
        ) ?? null
      : null;

  return {
    spaceId: input.spaceId,
    groupId: group?.id ?? null,
    group,
    contextId: group ? `group:${group.id}` : `space:${input.spaceId}`,
  };
}

export function isRecordInSubspaceContext(
  record: {
    spaceId: string;
    groupId?: string | null;
  },
  scope: {
    spaceId: string;
    groupId: string | null;
  },
) {
  return record.spaceId === scope.spaceId && (record.groupId ?? null) === scope.groupId;
}
