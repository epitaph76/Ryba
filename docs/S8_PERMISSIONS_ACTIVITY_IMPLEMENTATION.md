# S-8. Permissions и Activity

Дата: `2026-04-09`

**Статус:** `done`

## Область работы

Этот документ фиксирует фактическую реализацию этапа `S-8` из `PROJECT_STATUS.md`.

На этом шаге Ryba перестаёт быть одиночным инструментом и получает базовую многопользовательскую пригодность:

- у workspace есть явный состав участников;
- вводятся базовые роли `owner`, `editor`, `viewer`;
- доступ последовательно наследуется от workspace к `space`, `group`, `entity`, `view`, `document` и `canvas`;
- ключевые действия пишутся в единую workspace activity / audit-ленту;
- UI не прячет права в backend, а показывает read-only / manage-состояние прямо в интерфейсе.

S-8 сознательно не превращается в enterprise ACL. Это первый рабочий permission layer для маленькой команды, без кастомных политик на каждый объект и без org-level IAM.

## Что добавлено

### Backend

- завершён workspace membership layer поверх `workspace_members`;
- при создании workspace владелец сразу получает роль `owner`, а новые участники приглашаются как `editor` или `viewer`;
- в `WorkspacesService` введены базовые permission-level проверки `read`, `edit`, `manage`;
- permission checks протянуты через уже существующие продуктовые сервисы: `spaces`, `groups`, `entities`, `relations`, `views`, `documents`, `canvas`, `entity types`;
- `viewer` остаётся в read-only режиме, `editor` может менять рабочий контент, но не управляет составом команды и структурой workspace, `owner` управляет и тем и другим;
- добавлен `WorkspaceActivityService` и единая модель событий для activity / audit trail;
- ключевые изменения структуры и контента пишутся в `activity_events` с привязкой к `workspace`, а при необходимости и к `space` / `group`.

### Shared layer

- доменные контракты расширены типами ролей workspace;
- добавлены схемы для membership endpoints и activity feed;
- web и api используют единые typed contract-ы для ролей, участников workspace и событий активности.

### Web

- в основном приложении добавлено видимое состояние текущей роли пользователя в выбранном workspace;
- `owner` может видеть и менять состав участников, приглашать новых людей и менять роли `editor/viewer`;
- `editor` и `viewer` видят состав команды и activity, но не получают owner-only действия;
- формы и действия для schema/structure management, saved views, entity detail и document editing переключаются в read-only там, где роль не позволяет редактирование;
- добавлен server-side activity feed, который показывает, кто и что менял в workspace;
- UI-слой permissions вынесен в отдельный helper, чтобы поведение `owner/editor/viewer` не расползалось по компонентам хаотично.

## API и миграции

Используются такие основные точки:

- `GET /workspaces/:workspaceId/members`
- `POST /workspaces/:workspaceId/members`
- `PATCH /workspaces/members/:membershipId`
- `GET /workspaces/:workspaceId/activity`

При этом существующие маршруты `spaces`, `groups`, `entities`, `relations`, `documents`, `saved views`, `canvas` и `entity types` продолжают жить на своих адресах, но теперь уважают permission checks из workspace membership model.

Для хранения activity добавлена миграция Drizzle `apps/api/drizzle/0007_outgoing_zaran.sql` и соответствующий snapshot в `apps/api/drizzle/meta`.

## Как это соответствует критериям этапа

Этап считается закрытым, потому что:

- продуктом уже может пользоваться маленькая команда, а не только один человек;
- у каждого участника есть понятная роль, а не скрытая договорённость "в голове";
- `viewer` не может случайно менять данные, `editor` не может случайно менять структуру и состав команды, `owner` управляет workspace целиком;
- права читаются в интерфейсе как явное состояние, а не только как backend-ошибка после клика;
- activity feed и audit-события помогают ответить на вопрос "кто и что сделал" без ручного разбора в чате;
- permission layer встроен поверх существующих S-2..S-7 слоёв без ломки публичных контрактов ядра.

## Тесты и проверка

Проверено локально:

- `corepack pnpm --filter @ryba/api test -- test/s8.integration.test.ts`
- `corepack pnpm --filter @ryba/api typecheck`
- `corepack pnpm --filter @ryba/web test -- src/workspace-permissions.test.ts`
- `corepack pnpm --filter @ryba/web typecheck`
- browser smoke для сценариев `owner / editor / viewer` и server-side activity feed

Покрытие сейчас держится на:

- `apps/api/test/s8.integration.test.ts`
- `apps/web/src/workspace-permissions.test.ts`
- UI-smoke вокруг owner-only member management, editor content editing, viewer read-only режима и activity visibility

## Что остаётся за рамками S-8

В этот этап не входят:

- enterprise ACL и кастомные политики на каждый объект;
- org-level IAM и сложные identity-сценарии;
- отдельные membership-модели для каждого `space` или `group` поверх базового workspace membership;
- realtime collaboration как отдельный слой следующего этапа;
- межподпространственные qualified links и cross-subspace references, которые вынесены в отдельный `S-8A`;
- попытка превратить permissions в универсальный policy engine раньше, чем закреплён базовый team workflow.

## Результат этапа

Главный результат `S-8` теперь формулируется так:

Ryba уже можно безопасно использовать маленькой команде: роли видимы, права последовательно соблюдаются, ключевые действия оставляют audit trail, а существующие space/group контексты продолжают работать без смешивания доступа и ответственности.

Следующий логичный ход после `S-8` теперь разделён на два слоя:

- `S-8A`: explicit cross-subspace references;
- `S-9`: realtime collaboration для documents.

## Изменённые файлы

- `docs/S8_PERMISSIONS_ACTIVITY_IMPLEMENTATION.md`
