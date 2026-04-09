import { useEffect } from 'react';
import type {
  DocumentBacklinkRecord,
  DocumentEntityPreview,
  DocumentLinkDefinition,
  EntityRecord,
} from '@ryba/types';

import { DocumentComposer } from './document-composer';
import type { DocumentDraft } from './document-model';

interface EntityDocumentDialogProps {
  open: boolean;
  entity: EntityRecord | null;
  currentDocumentId: string | null;
  entities: EntityRecord[];
  linkDefinitions: DocumentLinkDefinition[];
  draft: DocumentDraft;
  linkedEntities: DocumentEntityPreview[];
  backlinks: DocumentBacklinkRecord[];
  loading: boolean;
  saving: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: () => void;
  onOpenEntity: (entityId: string, groupId: string | null) => void;
  onOpenBacklink: (backlink: DocumentBacklinkRecord) => void;
  onDraftChange: (draft: DocumentDraft) => void;
}

export function EntityDocumentDialog({
  open,
  entity,
  currentDocumentId,
  entities,
  linkDefinitions,
  draft,
  linkedEntities,
  backlinks,
  loading,
  saving,
  busy,
  onClose,
  onSave,
  onOpenEntity,
  onOpenBacklink,
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
              Документ открывается по двойному клику на ноде. Ссылки между документами
              превращаются в связи на канве после сохранения.
            </p>
          </div>
          <div className="document-dialog__actions">
            <button type="button" className="button button--ghost" onClick={onClose}>
              Закрыть
            </button>
            <button
              type="button"
              className="button"
              disabled={busy || saving || loading}
              onClick={onSave}
            >
              {saving ? 'Сохраняю...' : 'Сохранить документ'}
            </button>
          </div>
        </header>

        <div className="document-dialog__content">
          <div className="document-dialog__editor">
            {loading ? (
              <section className="panel">
                <p className="panel__hint">Загружаю документ...</p>
              </section>
            ) : (
              <DocumentComposer
                key={`${entity.id}:${currentDocumentId ?? 'draft'}`}
                currentDocumentId={currentDocumentId}
                ownerEntityId={entity.id}
                title={draft.title}
                body={draft.body}
                entities={entities.filter((item) => item.id !== entity.id)}
                linkDefinitions={linkDefinitions}
                disabled={busy || saving}
                onTitleChange={(title) => onDraftChange({ ...draft, title })}
                onBodyChange={(body) => onDraftChange({ ...draft, body })}
              />
            )}
          </div>

          <aside className="document-dialog__sidebar">
            <section className="panel">
              <div className="panel__header">
                <h2>Как ссылаться</h2>
                <span>4 правила</span>
              </div>
              <p className="panel__hint">
                1. Старую ссылку на сущность всё ещё можно вставить из списка сверху.
              </p>
              <p className="panel__hint">
                2. В исходном документе задай определение как `link_name**какой-то текст**`
                или `link_name$$какой-то текст$$`.
              </p>
              <p className="panel__hint">
                3. В другом документе внутри того же подпроcтранства просто напиши
                `link_name`. Редактор развернёт его в полный токен.
              </p>
              <p className="panel__hint">
                4. Для явной межгрупповой ссылки используй `root.link_name` или
                `group-slug.link_name`. Обычный `link_name` по-прежнему ищется только в
                текущем подпроcтранстве.
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
                  Пока нет ссылок. Добавь ссылку в текст и после сохранения появится
                  связь между нодами.
                </p>
              ) : (
                <div className="document-preview-list">
                  {linkedEntities.map((item) => (
                    <button
                      key={item.entityId}
                      type="button"
                      className="entity-preview-card"
                      onClick={() => onOpenEntity(item.entityId, item.groupId)}
                    >
                      <strong>{item.title}</strong>
                      <span>
                        {item.summary ?? item.label ?? 'Без описания'}
                        {item.groupSlug ? ` • ${item.groupSlug}` : ' • root'}
                      </span>
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
                      onClick={() => onOpenBacklink(backlink)}
                    >
                      <strong>{backlink.documentTitle}</strong>
                      <span>
                        {backlink.previewText}
                        {backlink.sourceGroupSlug ? ` • ${backlink.sourceGroupSlug}` : ' • root'}
                      </span>
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
