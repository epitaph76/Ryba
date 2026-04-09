FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

FROM base AS deps
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app

COPY apps/web apps/web
COPY packages/types packages/types

RUN pnpm --filter @ryba/types build \
  && pnpm --filter @ryba/web typecheck \
  && pnpm --filter @ryba/web build

FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
