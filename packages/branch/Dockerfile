# ── Stage 1: install deps ─────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/branch/package.json    ./packages/branch/
COPY packages/contracts/package.json ./packages/contracts/

RUN pnpm install --frozen-lockfile --filter "@zadanie-defi/branch..."

# ── Stage 2: build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app /app

COPY packages/contracts ./packages/contracts
COPY packages/branch    ./packages/branch

ARG NEXT_PUBLIC_CHAIN_ID=11155111
ARG NEXT_PUBLIC_RPC_URL=http://localhost:8545
ARG NEXT_PUBLIC_BRANCH_ADDRESS=""
ARG NEXT_PUBLIC_BRANCH_NAME="GymFinder"
ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL
ENV NEXT_PUBLIC_BRANCH_ADDRESS=$NEXT_PUBLIC_BRANCH_ADDRESS
ENV NEXT_PUBLIC_BRANCH_NAME=$NEXT_PUBLIC_BRANCH_NAME

RUN pnpm --filter "@zadanie-defi/branch" run sync:abi
RUN pnpm --filter "@zadanie-defi/branch" run build

# ── Stage 3: lean runtime ─────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder --chown=appuser:appgroup /app/packages/branch/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/packages/branch/.next/static \
     ./packages/branch/.next/static

USER appuser
EXPOSE 3001
ENV PORT=3001
# Runtime secrets (OPERATOR_PRIVATE_KEY, JWT_SECRET, etc.) must be injected
# via docker run --env-file or docker compose environment — never baked in.
CMD ["node", "packages/branch/server.js"]
