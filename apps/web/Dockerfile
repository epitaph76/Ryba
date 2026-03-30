FROM node:22-alpine

WORKDIR /app

RUN corepack enable

COPY package.json ./

RUN corepack pnpm install

COPY . .

RUN corepack pnpm typecheck && corepack pnpm build

EXPOSE 4173

CMD ["corepack", "pnpm", "preview"]
