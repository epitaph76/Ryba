# S-5. Documents и Narrative Layer

Дата: `2026-04-01`

**Статус:** `done`

## Область работы

Этот документ фиксирует фактическую реализацию этапа `S-5` из `PROJECT_STATUS.md`.

На этом шаге Ryba перестаёт воспринимать документ как отдельный побочный экран и переводит его в часть предметной модели:

- у каждой записи на канве может быть собственный документ;
- документ хранится как `1:1`-проекция `entity` через `documents.entity_id`;
- документ открывается из самой канвы, а не живёт отдельно от неё;
- ссылки внутри текста автоматически превращаются в связи между нодами;
- сущность получает narrative-контекст, а не только структурированные поля.

## Что входит в этап

Реализовано:

- persisted rich text через Tiptap;
- entity-backed document storage;
- entity mentions внутри текста;
- backlinks для упомянутых сущностей;
- preview linked entities и backlink sources;
- полноэкранный document view/edit flow;
- автоматическая синхронизация relations из mentions;
- web model-слой для сериализации и подготовки document payload.

Что сознательно не входит в `S-5`:

- range comments;
- version history;
- полноценный multiplayer UX;
- threaded discussions;
- сложные embeds/media workflows;
- tables, saved views и прочие lens-слои следующих этапов.

## Архитектура

### Entity-backed document model

Документ больше не живёт как независимая сущность второго сорта. Теперь:

- `documents.entity_id` связывает документ с конкретной записью на канве;
- для каждой записи документ существует как narrative view этой записи;
- API умеет получать и сохранять документ прямо по `entityId`;
- корневой ownership marker остаётся в payload, но скрывается из editable draft на фронте.

Это даёт простую расширяемую модель:

- запись остаётся центром данных;
- документ становится её narrative-слоем;
- detail view и document view работают вокруг одной и той же `entity`;
- в будущем можно расширять editor, не ломая доменную привязку.

### Storage и derived data

В backend слой входят:

- `documents` для самого документа;
- `document_entity_mentions` для явных ссылок из текста;
- `relations` как производный граф, синхронизируемый из mentions при сохранении.

Важное поведение:

- mention можно сохранить только на сущность из того же `workspace` и `space`;
- self-link на owning entity не превращается в графовую связь;
- удалённые из текста mentions удаляют и соответствующие auto-relations;
- backlinks читаются из mention storage, а не вычисляются эвристически на клиенте.

## API слой

В `apps/api` этап выражен так:

- `GET /entities/:entityId/document`
- `PUT /entities/:entityId/document`
- `GET /entities/:entityId/document-backlinks`
- legacy document endpoints остаются, но основной `S5` flow теперь идёт через `entityId`

Дополнительно backend делает две вещи, которые важны для UX:

- при сохранении документа синхронно обновляет `relations` типа `document_link` на основе mentions;
- при повторной регистрации существующего email отдаёт `409 CONFLICT` с `details: { email, canLogin: true }`, чтобы фронт мог сразу переводить пользователя в login-flow.

## UI слой

Фактический пользовательский flow теперь такой:

1. Пользователь открывает пространство и видит канву сущностей.
2. Двойной клик по ноде открывает полноэкранный редактор документа этой записи.
3. В редакторе можно писать rich text и вставлять ссылки через mention picker.
4. После сохранения ссылки из текста автоматически создают или обновляют связи между нодами на канве.
5. В документе видны связанные записи и обратные ссылки.
6. В detail panel остаются typed fields и metadata той же сущности.

Что изменилось относительно старого прототипа:

- убран legacy sidebar с отдельным списком документов;
- убран ручной `connect` flow для document-сценария;
- связи строятся из текста, а не рисуются вручную;
- документ открывается как часть работы с нодой;
- выбранную ноду можно удалить клавишей `Delete`;
- ключевые пользовательские тексты переведены на русский;
- верхняя панель и fullscreen dialog получили более устойчивый layout.

## Как сейчас работают ссылки

Ссылка создаётся не вручную линией на канве, а из редактора документа:

- в тулбаре выбирается сущность в mention picker;
- кнопка `Вставить ссылку` вставляет mention-токен в текст;
- при сохранении фронт сериализует документ в `DocumentBlock[]`;
- backend извлекает mentions, валидирует их и обновляет `document_entity_mentions`;
- из актуального набора mentions backend синхронизирует `relations`;
- после перезагрузки канвы пользователь видит появившиеся или обновлённые связи между нодами.

То есть источник истины для narrative-связей здесь именно текст документа.

## Тесты и проверка

Этап покрыт двумя уровнями проверки:

- `apps/api/test/s5.integration.test.ts`
- `apps/web/src/document-model.test.ts`
- `apps/web/src/entity-document-model.test.ts`

Для локальной проверки использовались:

- `corepack pnpm --dir packages/types build`
- `corepack pnpm --dir packages/schemas build`
- `corepack pnpm --filter @ryba/api typecheck`
- `corepack pnpm --filter @ryba/api test -- --runInBand`
- `corepack pnpm --filter @ryba/web typecheck`
- `corepack pnpm --filter @ryba/web test`
- `corepack pnpm --filter @ryba/web build`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm build`

## Результат этапа

Главный результат `S-5` теперь формулируется так:

Ryba работает не только как граф сущностей и не только как набор typed fields. Каждая нода получила narrative-поверхность, где можно фиксировать контекст, связывать записи текстом и автоматически отражать эти связи обратно на канву.

Следующий логичный этап roadmap после `S-5` — `S-6`, то есть `Tables и Saved Views`.
