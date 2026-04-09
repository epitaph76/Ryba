import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { DocumentLinkDefinition } from '@ryba/types';
import { escapeRegExp, extractDocumentLinkTokens } from './document-link-runtime';

const ENTITY_MENTION_PATTERN = /\[\[entity:[^\]|]+(?:\|[^\]]+)?\]\]/g;

interface DocumentLinkHighlightOptions {
  getCurrentDocumentId: () => string | null;
  getDefinitions: () => Map<string, DocumentLinkDefinition>;
}

const intersectsSelection = (
  start: number,
  end: number,
  selectionFrom: number,
  selectionTo: number,
) => {
  if (selectionFrom === selectionTo) {
    return selectionFrom >= start && selectionFrom <= end;
  }

  return start < selectionTo && end > selectionFrom;
};

const activateUsageSelection = (view: EditorView, target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tokenElement = target.closest<HTMLElement>('.document-editor__link-token--usage');

  if (!tokenElement || tokenElement.classList.contains('is-active')) {
    return false;
  }

  const tokenLength = tokenElement.textContent?.length ?? 0;

  if (tokenLength === 0) {
    return false;
  }

  try {
    const from = view.posAtDOM(tokenElement, 0);
    const to = from + tokenLength;

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
    view.focus();

    return true;
  } catch {
    return false;
  }
};

const buildDecorations = (
  doc: ProseMirrorNode,
  selectionFrom: number,
  selectionTo: number,
  currentDocumentId: string | null,
  definitionMap: Map<string, DocumentLinkDefinition>,
) => {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return;
    }

    const occupiedRanges: Array<{ start: number; end: number }> = [];

    for (const token of extractDocumentLinkTokens(node.text)) {
      const from = pos + token.start;
      const to = from + token.raw.length;
      const isActive = intersectsSelection(from, to, selectionFrom, selectionTo);
      occupiedRanges.push({ start: token.start, end: token.end });
      decorations.push(
        Decoration.inline(from, to, {
          class: `document-editor__link-token${isActive ? ' is-active' : ''}`,
        }),
      );
    }

    const definitions = Array.from(definitionMap.values())
      .filter(
        (definition) =>
          definition.mode === 'static' && definition.sourceDocumentId !== currentDocumentId,
      )
      .sort((left, right) => right.key.length - left.key.length);

    for (const definition of definitions) {
      const pattern = new RegExp(
        `(^|[^A-Za-z0-9_.-])(${escapeRegExp(definition.key)})\\b(?!\\*\\*|\\$\\$)`,
        'g',
      );

      for (const match of node.text.matchAll(pattern)) {
        const prefix = match[1] ?? '';
        const key = match[2];
        const matchIndex = match.index ?? -1;

        if (!key || matchIndex < 0) {
          continue;
        }

        const start = matchIndex + prefix.length;
        const end = start + key.length;
        const overlaps = occupiedRanges.some((range) => start < range.end && end > range.start);

        if (overlaps) {
          continue;
        }

        occupiedRanges.push({ start, end });
        const from = pos + start;
        const to = pos + end;
        const isActive = intersectsSelection(from, to, selectionFrom, selectionTo);

        decorations.push(
          Decoration.inline(from, to, {
            class: `document-editor__link-token document-editor__link-token--usage${isActive ? ' is-active' : ''}`,
            'data-link-display': definition.text,
          }),
        );
      }
    }

    for (const match of node.text.matchAll(ENTITY_MENTION_PATTERN)) {
      const value = match[0];
      const start = match.index ?? -1;

      if (!value || start < 0) {
        continue;
      }

      decorations.push(
        Decoration.inline(pos + start, pos + start + value.length, {
          class: 'document-editor__mention-token',
        }),
      );
    }
  });

  return DecorationSet.create(doc, decorations);
};

export const createDocumentLinkHighlightExtension = (options: DocumentLinkHighlightOptions) =>
  Extension.create({
    name: 'documentLinkHighlight',

    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            decorations: (state) =>
              buildDecorations(
                state.doc,
                state.selection.from,
                state.selection.to,
                options.getCurrentDocumentId(),
                options.getDefinitions(),
              ),
            handleClick: (view, _pos, event) => activateUsageSelection(view, event.target),
          },
        }),
      ];
    },
  });
