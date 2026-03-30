FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

FROM base AS deps
WORKDIR /app

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/schemas/package.json packages/schemas/package.json

RUN pnpm install --no-frozen-lockfile

FROM deps AS build
WORKDIR /app

COPY apps/api apps/api
COPY packages/types packages/types
COPY packages/schemas packages/schemas

RUN pnpm --filter @ryba/types build \
  && pnpm --filter @ryba/schemas build \
  && pnpm --filter @ryba/api build

FROM node:22-alpine AS runtime

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/schemas/package.json packages/schemas/package.json

RUN pnpm install --prod --no-frozen-lockfile

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/packages/schemas/dist ./packages/schemas/dist

EXPOSE 3001

CMD ["node", "apps/api/dist/main.js"]
