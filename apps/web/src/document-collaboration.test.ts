import { describe, expect, it } from 'vitest';

import {
  buildCollaborationServerUrl,
  createCollaborationIdentity,
  extractCollaborationPresence,
  formatCollaborationStatus,
  isPrimaryCollaborationSeedClient,
  shouldDeferInitialEmptyCollaborationBody,
  shouldDeferInitialEmptyCollaborationTitle,
} from './document-collaboration';

describe('document-collaboration', () => {
  it('normalizes collaboration URLs to websocket endpoints', () => {
    expect(buildCollaborationServerUrl('http://localhost:1234/')).toBe('ws://localhost:1234');
    expect(buildCollaborationServerUrl('https://ryba.local/collab')).toBe('wss://ryba.local/collab');
    expect(buildCollaborationServerUrl('ws://localhost:1234')).toBe('ws://localhost:1234');
    expect(buildCollaborationServerUrl('')).toBeNull();
  });

  it('creates stable identities and extracts unique presence items', () => {
    const currentUser = createCollaborationIdentity({
      id: 'user-1',
      email: 'demo@ryba.local',
      displayName: 'Demo User',
    });

    const presence = extractCollaborationPresence(
      [
        { clientId: 1, user: currentUser },
        { clientId: 2, user: currentUser },
        {
          clientId: 3,
          user: {
            id: 'user-2',
            name: 'Second Editor',
            email: 'editor@ryba.local',
            color: '#22c55e',
          },
        },
      ],
      currentUser.id,
    );

    expect(presence).toEqual([
      expect.objectContaining({
        id: 'user-1',
        name: 'Demo User',
        isCurrentUser: true,
        initials: 'DU',
      }),
      expect.objectContaining({
        id: 'user-2',
        name: 'Second Editor',
        isCurrentUser: false,
        initials: 'SE',
      }),
    ]);
  });

  it('formats collaboration status labels for saved and unsaved documents', () => {
    expect(formatCollaborationStatus('disabled', false)).toBe('Enable after first save');
    expect(formatCollaborationStatus('disabled', true)).toBe('Realtime unavailable');
    expect(formatCollaborationStatus('synced', true)).toBe('Synced');
  });

  it('keeps the local title until the first collaboration seed is applied', () => {
    expect(
      shouldDeferInitialEmptyCollaborationTitle(
        '',
        'Seeded title',
        null,
        'document-1',
      ),
    ).toBe(true);
    expect(
      shouldDeferInitialEmptyCollaborationTitle(
        'Remote title',
        'Seeded title',
        null,
        'document-1',
      ),
    ).toBe(false);
    expect(
      shouldDeferInitialEmptyCollaborationTitle(
        '',
        'Seeded title',
        'document-1',
        'document-1',
      ),
    ).toBe(false);
  });

  it('keeps the local body until the first collaboration seed is applied', () => {
    expect(
      shouldDeferInitialEmptyCollaborationBody(
        0,
        1,
        null,
        'document-1',
      ),
    ).toBe(true);
    expect(
      shouldDeferInitialEmptyCollaborationBody(
        2,
        1,
        null,
        'document-1',
      ),
    ).toBe(false);
    expect(
      shouldDeferInitialEmptyCollaborationBody(
        0,
        1,
        'document-1',
        'document-1',
      ),
    ).toBe(false);
  });

  it('elects the lowest awareness client id as the seed source', () => {
    expect(
      isPrimaryCollaborationSeedClient(
        [
          { clientId: 42, user: { id: 'user-1' } },
          { clientId: 7, user: { id: 'user-2' } },
        ],
        7,
      ),
    ).toBe(true);
    expect(
      isPrimaryCollaborationSeedClient(
        [
          { clientId: 42, user: { id: 'user-1' } },
          { clientId: 7, user: { id: 'user-2' } },
        ],
        42,
      ),
    ).toBe(false);
  });
});
