FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/marketing ./apps/marketing
RUN pnpm install --frozen-lockfile

FROM deps AS builder
RUN pnpm --filter @sgc/ui --filter @sgc/marketing build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/marketing ./apps/marketing
USER node
EXPOSE 3001
CMD ["pnpm", "--filter", "@sgc/marketing", "start"]
