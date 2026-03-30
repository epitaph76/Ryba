import { useEffect, useMemo, useState } from 'react';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/react';
import { editorSeedContent } from '../data';
import type { EditorSnapshot } from '../types';
import { PrototypeChrome } from './PrototypeChrome';

const ENTITY_REF_PATTERN = /\[\[entity:([A-Z0-9_-]+)\]\]/g;

function buildSnapshot(text: string): EditorSnapshot {
  const entityRefs = Array.from(text.matchAll(ENTITY_REF_PATTERN), (match) => match[1]);
  const compactText = text.replace(/\s+/g, ' ').trim();
  const words = compactText ? compactText.split(' ').length : 0;

  return {
    text: compactText,
    characterCount: text.length,
    wordCount: words,
    entityRefs,
  };
}

export function EditorPrototype() {
  const [entityId, setEntityId] = useState('ENT-1024');
  const [snapshot, setSnapshot] = useState<EditorSnapshot>(() =>
    buildSnapshot(editorSeedContent.replace(/<[^>]+>/g, ' ')),
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start a technical note and reference entities with [[entity:ENT-1024]].',
      }),
    ],
    content: editorSeedContent,
    editorProps: {
      attributes: {
        class: 'tiptap-prose',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      setSnapshot(buildSnapshot(currentEditor.getText()));
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    setSnapshot(buildSnapshot(editor.getText()));
  }, [editor]);

  const metadata = useMemo(
    () => ({
      linkedEntityId: entityId,
      refCount: snapshot.entityRefs.length,
      refs: snapshot.entityRefs,
    }),
    [entityId, snapshot.entityRefs],
  );

  const insertEntityReference = () => {
    if (!editor) {
      return;
    }

    editor.chain().focus().insertContent(` [[entity:${entityId}]] `).run();
  };

  return (
    <PrototypeChrome
      title="Editor prototype"
      summary="Tiptap starter kit with a small entity-reference concept. We only need to know the document layer is viable."
      aside={
        <div className="stack">
          <div className="info-card">
            <h3>Entity link helper</h3>
            <label className="field">
              <span>Linked entity ID</span>
              <input
                type="text"
                value={entityId}
                onChange={(event) => setEntityId(event.target.value.toUpperCase())}
                spellCheck={false}
              />
            </label>
            <button type="button" className="button" onClick={insertEntityReference}>
              Insert entity token
            </button>
          </div>
          <div className="info-card">
            <h3>Document metadata</h3>
            <dl className="metric-grid">
              <div>
                <dt>Words</dt>
                <dd>{snapshot.wordCount}</dd>
              </div>
              <div>
                <dt>Characters</dt>
                <dd>{snapshot.characterCount}</dd>
              </div>
              <div>
                <dt>Refs</dt>
                <dd>{metadata.refCount}</dd>
              </div>
            </dl>
          </div>
        </div>
      }
    >
      <div className="editor-shell">
        <div className="editor-toolbar">
          <button type="button" className="button button--ghost" onClick={() => editor?.chain().focus().toggleBold().run()}>
            Bold
          </button>
          <button type="button" className="button button--ghost" onClick={() => editor?.chain().focus().toggleItalic().run()}>
            Italic
          </button>
          <button type="button" className="button button--ghost" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
            Heading
          </button>
          <button type="button" className="button button--ghost" onClick={insertEntityReference}>
            Entity token
          </button>
        </div>
        <div className="editor-body">
          <EditorContent editor={editor} />
        </div>
        <div className="metadata-panel">
          <div>
            <strong>Helper metadata</strong>
            <p>Entity references are parsed from plain text tokens so the relationship model can stay simple during research.</p>
          </div>
          <pre>{JSON.stringify(metadata, null, 2)}</pre>
        </div>
      </div>
    </PrototypeChrome>
  );
}
