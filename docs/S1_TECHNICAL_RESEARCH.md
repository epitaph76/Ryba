# S-1. Заметки по техническому исследованию

Дата: `2026-03-30`

## Область работы

Этот документ фиксирует технические выводы по этапу `S-1` до начала реализации core domain.

Подготовленные прототипы:

- `apps/web`: прототип на React + Vite, включающий:
  - канву на React Flow с кастомными узлами;
  - табличный прототип на TanStack Table + TanStack Virtual;
  - прототип редактора на Tiptap с токенами ссылок на сущности.
- `apps/api`: минимальный Nest API с эндпоинтами:
  - `GET /health`;
  - `GET /db/health` (проверка PostgreSQL через `SELECT 1`).
- `apps/collab`: сервер совместной работы на Hocuspocus + Yjs с логами жизненного цикла.
- `packages/types`: общие типы домена.
- `packages/schemas`: общие zod-схемы.
- Docker-конфигурация:
  - `docker-compose.yml` для Postgres/API/Collab/Web;
  - отдельные Dockerfile для `api`, `web`, `collab`.

## Рабочий цикл разработки

1. Скопировать `.env.example` в `.env` и при необходимости скорректировать значения.
2. Поднять инфраструктуру:
   - `docker compose up -d postgres`
3. Поднять API и Postgres в Docker:
   - `docker compose up --build -d postgres api`
4. При необходимости дополнительно поднять:
   - `docker compose up --build -d collab`
   - `docker compose --profile frontend up --build -d web`
5. Остановить всё:
   - `docker compose down`

## Выводы по прототипам

## Канва (React Flow)

- Кастомный рендеринг узлов работает и поддерживает полезную доменную нагрузку.
- Рёбра связей и управление viewport в текущем стеке реализуются без лишней сложности.
- Вывод: `reactflow` подходит как базовая библиотека для этапов `S-2` и `S-3`.

## Таблица (TanStack Table + Virtual)

- Виртуализация нормально работает на больших наборах строк и ограничивает стоимость DOM/render.
- Эргономики column model и row model достаточно для ранней работы с сохранёнными представлениями и таблицами.
- Вывод: оставляем `@tanstack/react-table` и `@tanstack/react-virtual`.

## Редактор (Tiptap)

- Базовый поток работы с rich text стабилен.
- Ссылки на сущности можно представлять лёгкими токенами вида `[[entity:...]]` на этапе исследования.
- Вывод: Tiptap подходит для дальнейшего развития документного слоя.

## Совместная работа (Yjs + Hocuspocus)

- Минимальный сервер стабилен и логирует хуки жизненного цикла документа.
- Health-check и поведение при старте/остановке предсказуемы.
- Вывод: `@hocuspocus/server` и `yjs` подходят для realtime-направления документов.

## API + PostgreSQL

- Минимальный Nest API работает корректно с простым слоем health-check.
- Подключение к PostgreSQL подтверждено runtime-проверкой.
- Запуск Postgres и API в Docker Desktop прямолинеен.
- Вывод: связка Nest + PostgreSQL подходит для backend-скелета этапа `S-2`.

## Ответы на exit criteria для `S-1`

- Хранение сущностей: реляционная модель таблиц + типизированная форма в `packages/types`.
- Хранение связей: явные записи relations со ссылками на entity ID.
- Хранение макета канвы: отдельная модель layout (`CanvasNodeLayout`, `CanvasEdgeLayout`, `CanvasViewport`), отделённая от source of truth сущностей.
- Ссылки документа на сущности: текстовые токены сущностей + структурированная модель document reference в общих типах.
- Обмен типами между frontend и backend: workspace-пакеты `@ryba/types` и `@ryba/schemas`, которые используют и `web`, и `api`.
- Библиотеки, которые остаются:
  - `reactflow`
  - `@tanstack/react-table`
  - `@tanstack/react-virtual`
  - `@tiptap/react` + `@tiptap/starter-kit`
  - `@hocuspocus/server` + `yjs`
  - `@nestjs/*` + `pg`
- Библиотеки, которые сейчас нужно заменить: на этом этапе не выявлены.

## Подтверждённый out of scope

В `S-1` не реализовывались:

- система аутентификации;
- permissions;
- CRM-слой;
- production-polish интерфейса.
