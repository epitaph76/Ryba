# S-3. Заметки по реализации базовой канвы

Дата: `2026-04-01`

## Область работы

Этот документ фиксирует реализованный этап `S-3` из `PROJECT_STATUS.md`:

- реальное представление канвы поверх `spaces`, `entities` и `relations`;
- отдельное сохранение layout канвы, независимое от domain source of truth;
- минимальный web-сценарий для создания сущностей и связей прямо с канвы;
- API-контракты канвы, общие типы и автоматические проверки.

Что не входило в `S-3`:

- дизайнер схем сущностей и типизированная система полей (`S-4`);
- документный слой, таблицы, saved views и внешние данные;
- realtime-совместная работа на канве;
- продвинутая auto-layout или whiteboard-функциональность.

## Реализованная архитектура

### API и хранение

- В PostgreSQL добавлена таблица `space_canvas_states`.
- В `apps/api` добавлен `CanvasModule`.
- Добавлены эндпоинты:
  - `GET /spaces/:spaceId/canvas`
  - `PUT /spaces/:spaceId/canvas`
- Макет канвы хранится отдельно от `entities` и `relations`.
- `GET /spaces/:spaceId/canvas` возвращает пригодное состояние по умолчанию, даже если layout ещё не сохранялся.
- `PUT /spaces/:spaceId/canvas` валидирует:
  - что каждый узел ссылается на существующую сущность в том же space;
  - что каждое ребро ссылается на существующую relation в том же space;
  - что концы ребра совпадают с source/target соответствующей relation.

### Общие контракты

В `@ryba/types` и `@ryba/schemas` были добавлены и расширены контракты канвы:

- `CanvasLayout`
- `CanvasStateInput`
- `CanvasStateRecord`
- `canvasViewportSchema`
- `canvasLayoutSchema`
- `canvasStateRecordSchema`
- `saveCanvasStateRequestSchema`

Согласованный контракт `S-3` выглядит так:

- `GET /spaces/:spaceId/canvas -> CanvasStateRecord`
- `PUT /spaces/:spaceId/canvas -> CanvasStateRecord`

Где `CanvasStateRecord` содержит:

- `spaceId`
- `nodes`
- `edges`
- `viewport`
- `updatedAt`

### Веб-канва

`apps/web` теперь показывает рабочий экран `S-3` вместо изолированного prototype harness.

Реализованные возможности:

- аутентификация через реальный API;
- выбор workspace и space;
- загрузка реальных entities, relations и layout канвы;
- рендер карточек сущностей как узлов React Flow;
- рендер связей как рёбер графа;
- drag/drop, zoom, pan и selection;
- создание сущности двойным кликом по канве;
- создание relation через соединение хендлов;
- ручное сохранение layout через canvas API;
- минимальная панель инспектора сущности.

### Модель взаимодействия

Текущий UX этапа `S-3` намеренно остаётся минимальным:

- канва является навигационной линзой, а не source of truth;
- изменения layout сохраняются явно;
- создание сущностей может начинаться прямо с канвы;
- relation создаются через прямое соединение node-to-node;
- detail view намеренно остаётся поверхностным и не заходит в `S-4`.

## Тестирование и валидация

### Запущенные автоматические проверки

- `corepack pnpm db:migrate`
- `corepack pnpm --filter @ryba/web typecheck`
- `corepack pnpm --filter @ryba/web test`
- `corepack pnpm --filter @ryba/web build`
- `corepack pnpm --filter @ryba/api typecheck`
- `corepack pnpm --filter @ryba/api test`
- `corepack pnpm build`
- `corepack pnpm test`
- `corepack pnpm typecheck`

Примечание: локальные прогоны показывали warning по engine, потому что на машине использовался Node `24.x`, а в репозитории заявлено `>=22 <23`. Несмотря на это, все проверки завершились успешно.

### Интеграционные тесты API

`apps/api/test/s3.integration.test.ts` покрывает:

1. генерацию состояния канвы по умолчанию из реальных entities и relations;
2. roundtrip сохранения и загрузки для `PUT/GET /spaces/:spaceId/canvas`;
3. изоляцию доступа к канве между разными workspace.

`apps/api/test/s2.integration.test.ts` также остаётся зелёным вместе с `S-3`.

### Unit-тесты веба

`apps/web/src/canvas-model.test.ts` покрывает:

1. преобразование entities / relations / состояния канвы из API в структуру данных React Flow;
2. сериализацию текущего графа обратно в payload канвы для API.

## Как запустить и проверить локально

1. Установить зависимости:

```bash
corepack pnpm install
```

2. Подготовить env:

```bash
copy .env.example .env
```

3. Поднять PostgreSQL:

```bash
docker compose up -d postgres
```

4. Применить миграции:

```bash
corepack pnpm db:migrate
```

5. Запустить API:

```bash
corepack pnpm --filter @ryba/api dev
```

6. Запустить web:

```bash
corepack pnpm --filter @ryba/web dev
```

7. Проверить вручную:

- открыть `http://localhost:5173`;
- зарегистрироваться или войти;
- создать workspace и space;
- открыть канву;
- двойным кликом по канве создать сущности;
- соединить узлы, чтобы создать relation;
- перетащить узлы и сохранить layout;
- обновить канву и убедиться, что макет восстановился.

## Следующий шаг

После `S-3` правильный следующий этап: `S-4`, то есть слой деталей сущности и схемы поверх уже работающей навигационной модели канвы.
