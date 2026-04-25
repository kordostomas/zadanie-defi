# ── Stage 1: install deps ─────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/admin/package.json    ./packages/admin/
COPY packages/contracts/package.json ./packages/contracts/

RUN pnpm install --frozen-lockfile --filter "@zadanie-defi/admin..."

# ── Stage 2: build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app /app

COPY packages/contracts ./packages/contracts
COPY packages/admin     ./packages/admin

ARG NEXT_PUBLIC_CHAIN_ID=11155111
ARG NEXT_PUBLIC_RPC_URL=http://localhost:8545
ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL

RUN pnpm --filter "@zadanie-defi/admin" run sync:abi
RUN pnpm --filter "@zadanie-defi/admin" run build

# ── Stage 3: lean runtime ─────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder --chown=appuser:appgroup /app/packages/admin/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/packages/admin/.next/static \
     ./packages/admin/.next/static

USER appuser
EXPOSE 3000
ENV PORT=3000
CMD ["node", "packages/admin/server.js"]
