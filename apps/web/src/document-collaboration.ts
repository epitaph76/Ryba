import type { StatesArray } from '@hocuspocus/provider';
import type { UserRecord } from '@ryba/types';

const COLLABORATOR_PALETTE = [
  '#38bdf8',
  '#22c55e',
  '#f59e0b',
  '#f97316',
  '#f43f5e',
  '#a855f7',
  '#14b8a6',
  '#eab308',
];

export type DocumentCollaborationStatus =
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'synced'
  | 'disconnected'
  | 'error';

export interface CollaborationIdentity {
  id: string;
  name: string;
  email: string;
  color: string;
}

export interface CollaborationPresenceItem extends CollaborationIdentity {
  initials: string;
  isCurrentUser: boolean;
}

type AwarenessStateWithUser = {
  user?: {
    id?: string;
    name?: string;
    email?: string;
    color?: string;
  };
};

export const buildCollaborationServerUrl = (value: string | null | undefined): string | null => {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('ws://') || normalized.startsWith('wss://')) {
    return normalized.replace(/\/+$/, '');
  }

  if (normalized.startsWith('http://')) {
    return normalized.replace(/^http:\/\//, 'ws://').replace(/\/+$/, '');
  }

  if (normalized.startsWith('https://')) {
    return normalized.replace(/^https:\/\//, 'wss://').replace(/\/+$/, '');
  }

  return `ws://${normalized.replace(/\/+$/, '')}`;
};

export const createCollaborationIdentity = (
  user: Pick<UserRecord, 'id' | 'email' | 'displayName'>,
): CollaborationIdentity => {
  const name = user.displayName?.trim() || user.email;

  return {
    id: user.id,
    name,
    email: user.email,
    color: COLLABORATOR_PALETTE[Math.abs(hashValue(user.id)) % COLLABORATOR_PALETTE.length],
  };
};

export const extractCollaborationPresence = (
  states: StatesArray,
  currentUserId: string,
): CollaborationPresenceItem[] => {
  const items = new Map<string, CollaborationPresenceItem>();

  for (const state of states) {
    const normalized = normalizeAwarenessState(state as AwarenessStateWithUser, currentUserId);

    if (!normalized || items.has(normalized.id)) {
      continue;
    }

    items.set(normalized.id, normalized);
  }

  return Array.from(items.values()).sort((left, right) => {
    if (left.isCurrentUser !== right.isCurrentUser) {
      return left.isCurrentUser ? -1 : 1;
    }

    return left.name.localeCompare(right.name, 'ru');
  });
};

export const formatCollaborationStatus = (
  status: DocumentCollaborationStatus,
  hasDocument: boolean,
): string => {
  switch (status) {
    case 'disabled':
      return hasDocument ? 'Realtime unavailable' : 'Enable after first save';
    case 'connecting':
      return 'Connecting';
    case 'connected':
      return 'Connected';
    case 'synced':
      return 'Synced';
    case 'disconnected':
      return 'Reconnecting';
    case 'error':
      return 'Needs attention';
    default:
      return 'Unknown';
  }
};

export const shouldDeferInitialEmptyCollaborationTitle = (
  nextTitle: string,
  currentTitle: string,
  seededDocumentId: string | null,
  collaborationDocumentId: string | null,
): boolean =>
  nextTitle.length === 0 &&
  currentTitle.trim().length > 0 &&
  !!collaborationDocumentId &&
  seededDocumentId !== collaborationDocumentId;

export const shouldDeferInitialEmptyCollaborationBody = (
  nextBodyLength: number,
  currentBodyLength: number,
  seededDocumentId: string | null,
  collaborationDocumentId: string | null,
): boolean =>
  nextBodyLength === 0 &&
  currentBodyLength > 0 &&
  !!collaborationDocumentId &&
  seededDocumentId !== collaborationDocumentId;

export const isPrimaryCollaborationSeedClient = (
  states: StatesArray,
  currentClientId: number | null | undefined,
): boolean => {
  if (!Number.isInteger(currentClientId)) {
    return false;
  }

  const clientIds = states
    .map((state) => state.clientId)
    .filter((clientId): clientId is number => Number.isInteger(clientId))
    .sort((left, right) => left - right);

  return clientIds.length > 0 && clientIds[0] === currentClientId;
};

function normalizeAwarenessState(
  state: AwarenessStateWithUser,
  currentUserId: string,
): CollaborationPresenceItem | null {
  const user = state.user;
  const id = user?.id?.trim();
  const name = user?.name?.trim();
  const email = user?.email?.trim();
  const color = user?.color?.trim();

  if (!id || !name || !email || !color) {
    return null;
  }

  return {
    id,
    name,
    email,
    color,
    initials: buildInitials(name),
    isCurrentUser: id === currentUserId,
  };
}

function buildInitials(value: string): string {
  const parts = value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return '?';
  }

  return parts.map((item) => item[0]?.toUpperCase() ?? '').join('') || '?';
}

function hashValue(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = (hash << 5) - hash + character.charCodeAt(0);
    hash |= 0;
  }

  return hash;
}
