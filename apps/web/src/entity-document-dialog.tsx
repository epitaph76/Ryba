import { useEffect } from 'react';
import type {
  DocumentBacklinkRecord,
  DocumentEntityPreview,
  EntityRecord,
} from '@ryba/types';

import { DocumentComposer } from './document-composer';
import type { DocumentDraft } from './document-model';

interface EntityDocumentDialogProps {
  open: boolean;
  entity: EntityRecord | null;
  entities: EntityRecord[];
  draft: DocumentDraft;
  linkedEntities: DocumentEntityPreview[];
  backlinks: DocumentBacklinkRecord[];
  loading: boolean;
  saving: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
  onOpenEntity: (entityId: string) => void;
  onDraftChange: (draft: DocumentDraft) => void;
}

export function EntityDocumentDialog({
  open,
  entity,
  entities,
  draft,
  linkedEntities,
  backlinks,
  loading,
  saving,
  busy,
  onClose,
  onSave,
  onOpenEntity,
  onDraftChange,
}: EntityDocumentDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open || !entity) {
    return null;
  }

  return (
    <div className="document-dialog" role="dialog" aria-modal="true">
      <div className="document-dialog__backdrop" onClick={onClose} />
      <section className="document-dialog__panel">
        <header className="document-dialog__header">
          <div>
            <span className="eyebrow">Документ записи</span>
            <h2>{entity.title}</h2>
            <p>
              Двойной клик по ноде открывает этот полноэкранный редактор. Ссылки на другие записи
              автоматически превращаются в связи на канве после сохранения.
            </p>
          </div>
          <div className="document-dialog__actions">
            <button type="button" className="button button--ghost" onClick={onClose}>
              Закрыть
            </button>
            <button
              type="button"
              className="button"
              disabled={busy || saving}
              onClick={onSave}
            >
              {saving ? 'Сохраняю...' : 'Сохранить документ'}
            </button>
          </div>
        </header>

        <div className="document-dialog__content">
          <div className="document-dialog__editor">
            <DocumentComposer
              title={draft.title}
              body={draft.body}
              entities={entities.filter((item) => item.id !== entity.id)}
              disabled={busy || saving}
              onTitleChange={(title) => onDraftChange({ ...draft, title })}
              onBodyChange={(body) => onDraftChange({ ...draft, body })}
            />
          </div>

          <aside className="document-dialog__sidebar">
            <section className="panel">
              <div className="panel__header">
                <h2>Как ссылаться</h2>
                <span>1 способ</span>
              </div>
              <p className="panel__hint">
                Выбери сущность в выпадающем списке редактора и нажми `Вставить ссылку`.
                В текст вставится mention, а после сохранения на канве появится связь.
              </p>
            </section>

            <section className="panel">
              <div className="panel__header">
                <h2>Связанные записи</h2>
                <span>{linkedEntities.length}</span>
              </div>
              {loading ? (
                <p className="panel__hint">Загружаю связанные записи...</p>
              ) : linkedEntities.length === 0 ? (
                <p className="panel__hint">
                  Пока нет ссылок. Добавь mention в тексте, чтобы граф связей появился сам.
                </p>
              ) : (
                <div className="document-preview-list">
                  {linkedEntities.map((item) => (
                    <button
                      key={item.entityId}
                      type="button"
                      className="entity-preview-card"
                      onClick={() => onOpenEntity(item.entityId)}
                    >
                      <strong>{item.title}</strong>
                      <span>{item.summary ?? item.label ?? 'Без описания'}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel__header">
                <h2>Обратные ссылки</h2>
                <span>{backlinks.length}</span>
              </div>
              {backlinks.length === 0 ? (
                <p className="panel__hint">
                  На эту запись пока никто не ссылается из других документов.
                </p>
              ) : (
                <div className="document-preview-list">
                  {backlinks.map((backlink) => (
                    <button
                      key={`${backlink.documentId}-${backlink.anchorId ?? 'root'}`}
                      type="button"
                      className="entity-preview-card"
                      onClick={() => onOpenEntity(backlink.sourceEntityId)}
                    >
                      <strong>{backlink.documentTitle}</strong>
                      <span>{backlink.previewText}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      </section>
    </div>
  );
}
