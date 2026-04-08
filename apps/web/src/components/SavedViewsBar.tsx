import { useMemo, useState } from 'react';
import type { SavedViewRecord } from '@ryba/types';

type SavedViewsBarProps = {
  savedViews: SavedViewRecord[];
  activeSavedViewId: string | null;
  disabled: boolean;
  persistDisabled: boolean;
  busy: boolean;
  onSelectSavedView: (savedViewId: string | null) => void;
  onCreateSavedView: (name: string) => void;
  onOverwriteSavedView: (savedViewId: string) => void;
  onDeleteSavedView: (savedViewId: string) => void;
  onReset: () => void;
};

export function SavedViewsBar({
  savedViews,
  activeSavedViewId,
  disabled,
  persistDisabled,
  busy,
  onSelectSavedView,
  onCreateSavedView,
  onOverwriteSavedView,
  onDeleteSavedView,
  onReset,
}: SavedViewsBarProps) {
  const [draftName, setDraftName] = useState('');
  const activeSavedView = useMemo(
    () => savedViews.find((savedView) => savedView.id === activeSavedViewId) ?? null,
    [activeSavedViewId, savedViews],
  );

  return (
    <section className="saved-views-panel">
      <div className="saved-views-panel__header">
        <div>
          <strong>Saved views</strong>
          <span>{savedViews.length ? `${savedViews.length} сохранено` : 'Пока нет сохранённых представлений'}</span>
        </div>
        <button type="button" className="button button--ghost" onClick={onReset} disabled={disabled || busy}>
          Сбросить
        </button>
      </div>

      <div className="saved-views-panel__list">
        {savedViews.length === 0 ? (
          <p className="panel__hint">
            Сохрани рабочую конфигурацию фильтров, сортировки и колонок, чтобы открывать её в один клик.
          </p>
        ) : (
          savedViews.map((savedView) => (
            <button
              key={savedView.id}
              type="button"
              className={`saved-view-chip${savedView.id === activeSavedViewId ? ' is-active' : ''}`}
              onClick={() => onSelectSavedView(savedView.id)}
              disabled={disabled || busy}
            >
              <strong>{savedView.name}</strong>
              <span>{savedView.viewType === 'list' ? 'list view' : 'table view'}</span>
            </button>
          ))
        )}
      </div>

      <div className="saved-views-panel__actions">
        <label className="field">
          <span>Имя нового представления</span>
          <input
            type="text"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="Например, Мои активные задачи"
            disabled={disabled || busy || persistDisabled}
          />
        </label>
        <div className="actions">
          <button
            type="button"
            className="button"
            disabled={disabled || busy || persistDisabled || draftName.trim().length === 0}
            onClick={() => {
              onCreateSavedView(draftName.trim());
              setDraftName('');
            }}
          >
            Сохранить новое
          </button>
          <button
            type="button"
            className="button button--ghost"
            disabled={disabled || busy || persistDisabled || !activeSavedView}
            onClick={() => activeSavedView && onOverwriteSavedView(activeSavedView.id)}
          >
            Обновить текущее
          </button>
        </div>
        <button
          type="button"
          className="button button--ghost button--full"
          disabled={disabled || busy || persistDisabled || !activeSavedView}
          onClick={() => activeSavedView && onDeleteSavedView(activeSavedView.id)}
        >
          Удалить выбранное
        </button>
      </div>
    </section>
  );
}
