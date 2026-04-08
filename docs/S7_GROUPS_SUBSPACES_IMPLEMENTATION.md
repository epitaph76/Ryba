# S-7. Groups как Subspaces

Дата: `2026-04-08`

**Статус:** `done`

## Область работы

Этот документ фиксирует фактическую реализацию этапа `S-7` из `PROJECT_STATUS.md`.

Смысл этапа простой: внутри одного `space` теперь можно заводить локальные `group`-подпространства и работать в них как в отдельных рабочих комнатах. Это не папка и не новая иерархия workspace. Для S-7 реализован именно `subspace v1`: отдельный локальный контекст для graph-данных, документов, saved views и canvas без ухода в permissions или вложенные группы.

## Что добавлено

### Backend

- добавлена таблица `groups` и отдельное хранилище `group_canvas_states`;
- в `entities`, `relations`, `documents`, `saved_views` и `document_entity_mentions` добавлен nullable `groupId`;
- root space-контекст закреплён как `groupId = null`, а group-контекст обслуживается отдельными route-ветками;
- добавлены endpoint-ы для создания и чтения `groups`, а также для group-scoped `entities`, `relations`, `documents`, `saved views` и `canvas`;
- проверки не позволяют создавать relation между объектами из разных subspace-контекстов.

### Shared layer

- добавлены `GroupId`, `GroupRecord` и схемы для group request/response контрактов;
- общий доменный контракт расширен полем `groupId` для записей, которые теперь могут жить в root space или внутри group;
- web и api используют один и тот же typed contract для root- и group-scoped сценариев.

### Web

- добавлена модель активного subspace-контекста и helper-логика для выбора root space или конкретной `group`;
- пользователь может создать `group`, войти внутрь неё и вернуться обратно в корневой `space`;
- загрузка и сохранение `canvas`, `documents`, `saved views`, `entities` и `relations` переключаются по текущему subspace;
- локальный UI показывает, в каком контексте сейчас идёт работа, чтобы не смешивать root space и inner group.

## API и миграции

Используются такие основные точки:

- `GET /spaces/:spaceId/groups`
- `POST /spaces/:spaceId/groups`
- `GET /groups/:groupId/entities`
- `POST /groups/:groupId/entities`
- `GET /groups/:groupId/relations`
- `POST /groups/:groupId/relations`
- `GET /groups/:groupId/documents`
- `POST /groups/:groupId/documents`
- `GET /groups/:groupId/saved-views`
- `POST /groups/:groupId/saved-views`
- `GET /groups/:groupId/canvas`
- `PUT /groups/:groupId/canvas`

При этом корневые маршруты `spaces/:spaceId/...` продолжают работать только с root space-контекстом и не вытягивают group-данные.

Для хранения состояния добавлена миграция Drizzle `apps/api/drizzle/0006_outgoing_captain_marvel.sql` и соответствующий snapshot в `apps/api/drizzle/meta`.

## Как это соответствует критериям этапа

Этап считается закрытым, потому что:

- `group` ощущается как отдельный локальный контекст, а не как декоративная папка;
- новые объекты, созданные внутри `group`, остаются внутри неё и не всплывают в root space без причины;
- у `group` есть собственные `canvas`, `documents`, `saved views`, `entities` и `relations`;
- переход внутрь и наружу не требует отдельной модели данных и не ломает существующие S-3, S-5 и S-6 слои;
- v1 сознательно не расширен до nested groups, permissions и activity layer.

## Тесты и проверка

Проверено локально:

- `corepack pnpm --filter @ryba/types build`
- `corepack pnpm --filter @ryba/schemas build`
- `corepack pnpm --filter @ryba/api typecheck`
- `corepack pnpm --filter @ryba/api test -- test/s7.integration.test.ts`
- `corepack pnpm --filter @ryba/api build`
- `corepack pnpm --filter @ryba/web typecheck`
- `corepack pnpm --filter @ryba/web test -- src/subspace-model.test.ts`
- `corepack pnpm --filter @ryba/web test`
- `corepack pnpm --filter @ryba/web build`

Покрытие сейчас держится на:

- `apps/api/test/s7.integration.test.ts`
- `apps/web/src/subspace-model.test.ts`
- обновлённых web unit-тестах, где root space теперь явно моделируется как `groupId = null`
- общих типах и схемах в `packages/types` и `packages/schemas`

## Что остаётся за рамками S-7

В этот этап не входят:

- nested groups или произвольная иерархия subspaces;
- permissions, roles, activity feed и audit trail;
- перенос объектов между root space и group как отдельный workflow;
- внешние data sources, CRM-слой и другие следующие этапы roadmap;
- переработка общей архитектуры ради "универсального" containment engine.

## Изменённые файлы

- `docs/S7_GROUPS_SUBSPACES_IMPLEMENTATION.md`
