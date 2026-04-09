import { useEffect, useMemo, useRef, useState } from 'react';
import { HocuspocusProvider, WebSocketStatus, type StatesArray } from '@hocuspocus/provider';
import Collaboration from '@tiptap/extension-collaboration';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { DocumentBlock, DocumentLinkDefinition, EntityRecord, UserRecord } from '@ryba/types';
import * as Y from 'yjs';

import {
  buildCollaborationServerUrl,
  createCollaborationIdentity,
  extractCollaborationPresence,
  formatCollaborationStatus,
  isPrimaryCollaborationSeedClient,
  shouldDeferInitialEmptyCollaborationBody,
  shouldDeferInitialEmptyCollaborationTitle,
  type CollaborationPresenceItem,
  type DocumentCollaborationStatus,
} from './document-collaboration';
import { createDocumentLinkHighlightExtension } from './document-link-highlight-extension';
import {
  buildEditorHtmlFromBlocks,
  buildEntityMentionToken,
  createDocumentBlocksFromEditorJson,
  hasRenderableDocumentBlocks,
} from './document-model';

export interface DocumentComposerCollaborationConfig {
  documentId: string;
  token: string;
  websocketUrl: string;
  currentUser: Pick<UserRecord, 'id' | 'email' | 'displayName'>;
}

interface DocumentComposerProps {
  currentDocumentId: string | null;
  ownerEntityId: string;
  title: string;
  body: DocumentBlock[];
  entities: EntityRecord[];
  linkDefinitions: DocumentLinkDefinition[];
  disabled?: boolean;
  collaboration?: DocumentComposerCollaborationConfig | null;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: DocumentBlock[]) => void;
}

const DOCUMENT_PLACEHOLDER =
  '\u041f\u0438\u0448\u0438\u0442\u0435 \u0442\u0435\u043a\u0441\u0442 \u043a\u0430\u043a \u043e\u0431\u044b\u0447\u043d\u043e. \u0414\u043b\u044f \u0441\u0441\u044b\u043b\u043a\u0438 \u043d\u0430 \u0441\u0443\u0449\u043d\u043e\u0441\u0442\u044c \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435 \u043a\u043d\u043e\u043f\u043a\u0443 "\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0441\u0441\u044b\u043b\u043a\u0443".';
const TITLE_LABEL =
  '\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430';
const BOLD_LABEL = '\u0416\u0438\u0440\u043d\u044b\u0439';
const ITALIC_LABEL = '\u041a\u0443\u0440\u0441\u0438\u0432';
const HEADING_LABEL = '\u0417\u0430\u0433\u043e\u043b\u043e\u0432\u043e\u043a';
const MENTION_LABEL =
  '\u0421\u0441\u044b\u043b\u043a\u0430 \u043d\u0430 \u0441\u0443\u0449\u043d\u043e\u0441\u0442\u044c';
const NO_ENTITIES_LABEL =
  '\u041d\u0435\u0442 \u0441\u0443\u0449\u043d\u043e\u0441\u0442\u0435\u0439';
const INSERT_LINK_LABEL =
  '\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0441\u0441\u044b\u043b\u043a\u0443';
const CURRENT_USER_SUFFIX = '(\u0432\u044b)';

export function DocumentComposer({
  currentDocumentId,
  ownerEntityId,
  title,
  body,
  entities,
  linkDefinitions,
  disabled = false,
  collaboration = null,
  onTitleChange,
  onBodyChange,
}: DocumentComposerProps) {
  const [mentionEntityId, setMentionEntityId] = useState('');
  const [collaborationStatus, setCollaborationStatus] =
    useState<DocumentCollaborationStatus>('disabled');
  const [collaborationPeers, setCollaborationPeers] = useState<CollaborationPresenceItem[]>([]);
  const [collaborationError, setCollaborationError] = useState<string | null>(null);
  const [collaborationReadOnly, setCollaborationReadOnly] = useState(false);
  const latestSerializationContextRef = useRef({
    currentDocumentId,
    ownerEntityId,
    linkDefinitions,
  });
  const latestOnBodyChangeRef = useRef(onBodyChange);
  const latestOnTitleChangeRef = useRef(onTitleChange);
  const latestBodyRef = useRef(body);
  const latestTitleRef = useRef(title);
  const seededCollaborationDocumentIdRef = useRef<string | null>(null);
  const collaborationAwarenessStatesRef = useRef<StatesArray>([]);
  const [collaborationAwarenessRevision, setCollaborationAwarenessRevision] = useState(0);
  const [collaborationAwarenessStableRevision, setCollaborationAwarenessStableRevision] =
    useState(0);
  const collaborationUser = useMemo(
    () => (collaboration ? createCollaborationIdentity(collaboration.currentUser) : null),
    [
      collaboration?.currentUser.displayName,
      collaboration?.currentUser.email,
      collaboration?.currentUser.id,
    ],
  );
  const collaborationUrl = useMemo(
    () => buildCollaborationServerUrl(collaboration?.websocketUrl),
    [collaboration?.websocketUrl],
  );
  const linkHighlightExtension = useMemo(
    () =>
      createDocumentLinkHighlightExtension({
        getCurrentDocumentId: () => latestSerializationContextRef.current.currentDocumentId,
        getDefinitions: () =>
          new Map(
            latestSerializationContextRef.current.linkDefinitions.map((definition) => [
              definition.key,
              definition,
            ]),
          ),
      }),
    [],
  );
  const collaborationSession = useMemo(() => {
    if (!collaboration || !collaborationUrl) {
      return null;
    }

    const document = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: collaborationUrl,
      name: collaboration.documentId,
      document,
      token: collaboration.token,
      onAuthenticated: ({ scope }) => {
        setCollaborationReadOnly(scope === 'readonly');
        setCollaborationError(null);
      },
      onAuthenticationFailed: ({ reason }) => {
        setCollaborationStatus('error');
        setCollaborationError(reason);
      },
      onConnect: () => {
        setCollaborationError(null);
      },
      onStatus: ({ status }) => {
        setCollaborationStatus(mapCollaborationStatus(status));
      },
      onSynced: ({ state }) => {
        setCollaborationStatus(state ? 'synced' : 'connected');
      },
      onDisconnect: () => {
        setCollaborationStatus('disconnected');
      },
      onClose: () => {
        setCollaborationStatus('disconnected');
      },
      onAwarenessChange: ({ states }) => {
        collaborationAwarenessStatesRef.current = states;
        setCollaborationAwarenessRevision((current) => current + 1);
        setCollaborationPeers(
          collaborationUser
            ? extractCollaborationPresence(states, collaborationUser.id)
            : [],
        );
      },
    });

    return {
      document,
      provider,
      titleText: document.getText('title'),
      fragment: document.getXmlFragment('content'),
    };
  }, [
    collaboration?.documentId,
    collaboration?.token,
    collaborationUrl,
    collaborationUser?.color,
    collaborationUser?.email,
    collaborationUser?.id,
    collaborationUser?.name,
  ]);
  const collaborationEnabled = !!collaborationSession;
  const effectiveDisabled = disabled || collaborationReadOnly;
  const extensions = useMemo(
    () => [
      collaborationSession ? StarterKit.configure({ history: false }) : StarterKit,
      ...(collaborationSession
        ? [
            Collaboration.configure({
              document: collaborationSession.document,
              field: 'content',
            }),
          ]
        : []),
      linkHighlightExtension,
      Placeholder.configure({
        placeholder: DOCUMENT_PLACEHOLDER,
      }),
    ],
    [collaborationSession, linkHighlightExtension],
  );

  useEffect(() => {
    latestSerializationContextRef.current = {
      currentDocumentId,
      ownerEntityId,
      linkDefinitions,
    };
  }, [currentDocumentId, linkDefinitions, ownerEntityId]);

  useEffect(() => {
    latestOnBodyChangeRef.current = onBodyChange;
  }, [onBodyChange]);

  useEffect(() => {
    latestBodyRef.current = body;
  }, [body]);

  useEffect(() => {
    latestOnTitleChangeRef.current = onTitleChange;
  }, [onTitleChange]);

  useEffect(() => {
    latestTitleRef.current = title;
  }, [title]);

  useEffect(() => {
    if (!collaboration) {
      setCollaborationStatus('disabled');
      setCollaborationPeers([]);
      setCollaborationError(null);
      setCollaborationReadOnly(false);
      return;
    }

    if (!collaborationUrl) {
      setCollaborationStatus('disabled');
      setCollaborationPeers([]);
      setCollaborationError('Missing collaboration server URL');
      setCollaborationReadOnly(false);
      return;
    }

    setCollaborationStatus('connecting');
    setCollaborationPeers([]);
    setCollaborationError(null);
    setCollaborationReadOnly(false);
  }, [collaboration?.documentId, collaboration?.token, collaborationUrl]);

  useEffect(() => {
    if (!collaborationSession || !collaborationUser) {
      return;
    }

    collaborationSession.provider.setAwarenessField('user', collaborationUser);

    return () => {
      collaborationSession.provider.destroy();
      collaborationSession.document.destroy();
    };
  }, [collaborationSession, collaborationUser]);

  useEffect(() => {
    seededCollaborationDocumentIdRef.current = null;
    collaborationAwarenessStatesRef.current = [];
    setCollaborationAwarenessRevision(0);
    setCollaborationAwarenessStableRevision(0);
  }, [collaboration?.documentId]);

  useEffect(() => {
    if (
      !collaborationSession ||
      !collaboration ||
      collaborationStatus !== 'synced' ||
      collaborationAwarenessRevision === 0
    ) {
      setCollaborationAwarenessStableRevision(0);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCollaborationAwarenessStableRevision(collaborationAwarenessRevision);
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [
    collaboration?.documentId,
    collaborationAwarenessRevision,
    collaborationSession,
    collaborationStatus,
  ]);

  const editor = useEditor(
    {
      extensions,
      content: collaborationEnabled ? '<p></p>' : buildEditorHtmlFromBlocks(body),
      editorProps: {
        attributes: {
          class: 'document-editor__prose',
        },
      },
      editable: !effectiveDisabled,
      onUpdate: ({ editor: currentEditor }) => {
        const nextBody = createDocumentBlocksFromEditorJson(currentEditor.getJSON(), {
          currentDocumentId: latestSerializationContextRef.current.currentDocumentId,
          ownerEntityId: latestSerializationContextRef.current.ownerEntityId,
          linkDefinitions: latestSerializationContextRef.current.linkDefinitions,
        });

        if (
          collaborationEnabled &&
          shouldDeferInitialEmptyCollaborationBody(
            hasRenderableDocumentBlocks(nextBody) ? 1 : 0,
            hasRenderableDocumentBlocks(latestBodyRef.current) ? 1 : 0,
            seededCollaborationDocumentIdRef.current,
            collaboration?.documentId ?? null,
          )
        ) {
          return;
        }

        latestOnBodyChangeRef.current(nextBody);
      },
    },
    [collaborationEnabled, effectiveDisabled, extensions],
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!effectiveDisabled);
  }, [editor, effectiveDisabled]);

  useEffect(() => {
    if (!editor || collaborationEnabled) {
      return;
    }

    const currentBlocks = createDocumentBlocksFromEditorJson(editor.getJSON(), {
      currentDocumentId,
      ownerEntityId,
      linkDefinitions,
    });

    if (JSON.stringify(currentBlocks) === JSON.stringify(body)) {
      return;
    }

    editor.commands.setContent(buildEditorHtmlFromBlocks(body), false);
  }, [body, collaborationEnabled, currentDocumentId, editor, linkDefinitions, ownerEntityId]);

  useEffect(() => {
    if (!collaborationSession) {
      return;
    }

    const syncTitleFromCollaboration = () => {
      const nextTitle = collaborationSession.titleText.toString();

      if (
        shouldDeferInitialEmptyCollaborationTitle(
          nextTitle,
          latestTitleRef.current,
          seededCollaborationDocumentIdRef.current,
          collaboration?.documentId ?? null,
        )
      ) {
        return;
      }

      if (nextTitle === latestTitleRef.current) {
        return;
      }

      latestTitleRef.current = nextTitle;
      latestOnTitleChangeRef.current(nextTitle);
    };

    collaborationSession.titleText.observe(syncTitleFromCollaboration);
    syncTitleFromCollaboration();

    return () => {
      collaborationSession.titleText.unobserve(syncTitleFromCollaboration);
    };
  }, [collaboration?.documentId, collaborationSession]);

  useEffect(() => {
    if (
      !editor ||
      !collaborationSession ||
      !collaboration ||
      collaborationStatus !== 'synced' ||
      seededCollaborationDocumentIdRef.current === collaboration.documentId
    ) {
      return;
    }

    const currentBlocksBeforeSeed = createDocumentBlocksFromEditorJson(editor.getJSON(), {
      currentDocumentId,
      ownerEntityId,
      linkDefinitions,
    });
    const hasCurrentBody = hasRenderableDocumentBlocks(currentBlocksBeforeSeed);
    const hasCurrentTitle = collaborationSession.titleText.length > 0;
    const canSeedFromCurrentClient =
      collaborationAwarenessRevision > 0 &&
      collaborationAwarenessRevision === collaborationAwarenessStableRevision &&
      isPrimaryCollaborationSeedClient(
        collaborationAwarenessStatesRef.current,
        collaborationSession.document.clientID,
      );
    const shouldSeedTitle =
      canSeedFromCurrentClient &&
      !hasCurrentTitle &&
      title.trim().length > 0;
    const shouldSeedBody =
      canSeedFromCurrentClient &&
      !hasCurrentBody &&
      hasRenderableDocumentBlocks(body);

    if (!shouldSeedTitle && !shouldSeedBody && !hasCurrentTitle && !hasCurrentBody) {
      return;
    }

    if (shouldSeedTitle) {
      collaborationSession.document.transact(() => {
        collaborationSession.titleText.insert(0, title);
      }, 'seed-title');
    }

    if (shouldSeedBody) {
      editor.commands.setContent(buildEditorHtmlFromBlocks(body), false);
    }

    seededCollaborationDocumentIdRef.current = collaboration.documentId;

    const currentBlocks = shouldSeedBody ? body : currentBlocksBeforeSeed;

    if (JSON.stringify(currentBlocks) !== JSON.stringify(body)) {
      latestOnBodyChangeRef.current(currentBlocks);
    }
  }, [
    body,
    collaboration,
    collaborationSession,
    collaborationAwarenessRevision,
    collaborationAwarenessStableRevision,
    collaborationStatus,
    currentDocumentId,
    editor,
    linkDefinitions,
    ownerEntityId,
    title,
  ]);

  useEffect(() => {
    setMentionEntityId((current) => current || entities[0]?.id || '');
  }, [entities]);

  const canInsertMention = useMemo(
    () => !!editor && !!mentionEntityId && entities.some((entity) => entity.id === mentionEntityId),
    [editor, entities, mentionEntityId],
  );

  const collaborationStatusLabel = formatCollaborationStatus(
    collaborationStatus,
    !!currentDocumentId,
  );

  const insertMention = () => {
    if (!editor) {
      return;
    }

    const entity = entities.find((item) => item.id === mentionEntityId);

    if (!entity) {
      return;
    }

    editor.chain().focus().insertContent(` ${buildEntityMentionToken(entity)} `).run();
  };

  const handleTitleChange = (value: string) => {
    if (!collaborationSession) {
      latestTitleRef.current = value;
      latestOnTitleChangeRef.current(value);
      return;
    }

    const currentValue = collaborationSession.titleText.toString();

    if (currentValue === value) {
      return;
    }

    collaborationSession.document.transact(() => {
      collaborationSession.titleText.delete(0, collaborationSession.titleText.length);

      if (value.length > 0) {
        collaborationSession.titleText.insert(0, value);
      }
    }, 'title-input');
  };

  return (
    <div className="document-editor">
      <div className="document-editor__presence">
        <div className="document-editor__presence-status">
          <span
            className={`document-editor__presence-dot document-editor__presence-dot--${collaborationStatus}`}
            aria-hidden="true"
          />
          <strong>{collaborationStatusLabel}</strong>
          <span>
            {collaborationEnabled
              ? currentDocumentId
              : currentDocumentId
                ? 'Realtime off for this document'
                : 'Save once to share live edits'}
          </span>
        </div>
        {collaborationPeers.length > 0 ? (
          <div className="document-editor__presence-list" aria-label="Active collaborators">
            {collaborationPeers.map((peer) => (
              <span
                key={peer.id}
                className={`document-editor__presence-pill${peer.isCurrentUser ? ' is-current' : ''}`}
                title={peer.email}
              >
                <span
                  className="document-editor__presence-avatar"
                  style={{ backgroundColor: peer.color }}
                  aria-hidden="true"
                >
                  {peer.initials}
                </span>
                <span>{peer.isCurrentUser ? `${peer.name} ${CURRENT_USER_SUFFIX}` : peer.name}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {collaborationError ? (
        <p className="document-editor__presence-error" role="status">
          {collaborationError}
        </p>
      ) : null}

      <label className="field">
        <span>{TITLE_LABEL}</span>
        <input
          type="text"
          value={title}
          disabled={effectiveDisabled}
          onChange={(event) => handleTitleChange(event.target.value)}
        />
      </label>

      <div className="document-editor__toolbar">
        <button
          type="button"
          className="button button--ghost"
          disabled={effectiveDisabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          {BOLD_LABEL}
        </button>
        <button
          type="button"
          className="button button--ghost"
          disabled={effectiveDisabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          {ITALIC_LABEL}
        </button>
        <button
          type="button"
          className="button button--ghost"
          disabled={effectiveDisabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          {HEADING_LABEL}
        </button>
        <label className="document-editor__mention-picker">
          <span>{MENTION_LABEL}</span>
          <select
            value={mentionEntityId}
            disabled={effectiveDisabled || entities.length === 0}
            onChange={(event) => setMentionEntityId(event.target.value)}
          >
            {entities.length === 0 ? <option value="">{NO_ENTITIES_LABEL}</option> : null}
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button"
          disabled={effectiveDisabled || !canInsertMention}
          onClick={insertMention}
        >
          {INSERT_LINK_LABEL}
        </button>
      </div>

      <div className="document-editor__body">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function mapCollaborationStatus(status: WebSocketStatus): DocumentCollaborationStatus {
  switch (status) {
    case WebSocketStatus.Connecting:
      return 'connecting';
    case WebSocketStatus.Connected:
      return 'connected';
    case WebSocketStatus.Disconnected:
    default:
      return 'disconnected';
  }
}
