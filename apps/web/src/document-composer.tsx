import { useEffect, useMemo, useRef, useState } from 'react';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/react';
import type { DocumentBlock, DocumentLinkDefinition, EntityRecord } from '@ryba/types';

import { createDocumentLinkHighlightExtension } from './document-link-highlight-extension';
import {
  buildEditorHtmlFromBlocks,
  buildEntityMentionToken,
  createDocumentBlocksFromEditorJson,
} from './document-model';

interface DocumentComposerProps {
  currentDocumentId: string | null;
  ownerEntityId: string;
  title: string;
  body: DocumentBlock[];
  entities: EntityRecord[];
  linkDefinitions: DocumentLinkDefinition[];
  disabled?: boolean;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: DocumentBlock[]) => void;
}

export function DocumentComposer({
  currentDocumentId,
  ownerEntityId,
  title,
  body,
  entities,
  linkDefinitions,
  disabled = false,
  onTitleChange,
  onBodyChange,
}: DocumentComposerProps) {
  const [mentionEntityId, setMentionEntityId] = useState('');
  const latestSerializationContextRef = useRef({
    currentDocumentId,
    ownerEntityId,
    linkDefinitions,
  });
  const latestOnBodyChangeRef = useRef(onBodyChange);
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

  const editor = useEditor({
    extensions: [
      StarterKit,
      linkHighlightExtension,
      Placeholder.configure({
        placeholder:
          'Собери документ вокруг данных: фиксируй текст как обычно, а для ссылок используй link_name, link_name**текст** или link_name$$текст$$.',
      }),
    ],
    content: buildEditorHtmlFromBlocks(body),
    editorProps: {
      attributes: {
        class: 'document-editor__prose',
      },
    },
    editable: !disabled,
    onUpdate: ({ editor: currentEditor }) => {
      latestOnBodyChangeRef.current(
        createDocumentBlocksFromEditorJson(currentEditor.getJSON(), {
          currentDocumentId: latestSerializationContextRef.current.currentDocumentId,
          ownerEntityId: latestSerializationContextRef.current.ownerEntityId,
          linkDefinitions: latestSerializationContextRef.current.linkDefinitions,
        }),
      );
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) {
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
  }, [body, currentDocumentId, editor, linkDefinitions, ownerEntityId]);

  useEffect(() => {
    setMentionEntityId((current) => current || entities[0]?.id || '');
  }, [entities]);

  const canInsertMention = useMemo(
    () => !!editor && !!mentionEntityId && entities.some((entity) => entity.id === mentionEntityId),
    [editor, entities, mentionEntityId],
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

  return (
    <div className="document-editor">
      <label className="field">
        <span>Название документа</span>
        <input
          type="text"
          value={title}
          disabled={disabled}
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </label>

      <div className="document-editor__toolbar">
        <button
          type="button"
          className="button button--ghost"
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          Жирный
        </button>
        <button
          type="button"
          className="button button--ghost"
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          Курсив
        </button>
        <button
          type="button"
          className="button button--ghost"
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          Заголовок
        </button>
        <label className="document-editor__mention-picker">
          <span>Ссылка на сущность</span>
          <select
            value={mentionEntityId}
            disabled={disabled || entities.length === 0}
            onChange={(event) => setMentionEntityId(event.target.value)}
          >
            {entities.length === 0 ? <option value="">Нет сущностей</option> : null}
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
          disabled={disabled || !canInsertMention}
          onClick={insertMention}
        >
          Вставить ссылку
        </button>
      </div>

      <div className="document-editor__body">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
