# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# All three workspace manifests must be present for pnpm to build the full
# symlink graph; a partial workspace leaves per-package node_modules broken.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/admin/package.json     ./packages/admin/
COPY packages/branch/package.json    ./packages/branch/
COPY packages/contracts/package.json ./packages/contracts/

RUN pnpm install --frozen-lockfile

# Copy source after deps are installed
COPY packages/contracts ./packages/contracts
COPY packages/branch    ./packages/branch

# Ensure package-local node_modules exist for the build step
RUN pnpm --filter "@zadanie-defi/branch" install --frozen-lockfile

ARG NEXT_PUBLIC_CHAIN_ID=11155111
ARG NEXT_PUBLIC_RPC_URL
ARG NEXT_PUBLIC_BRANCH_ADDRESS
ARG NEXT_PUBLIC_BRANCH_NAME=GymFinder
ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL
ENV NEXT_PUBLIC_BRANCH_ADDRESS=$NEXT_PUBLIC_BRANCH_ADDRESS
ENV NEXT_PUBLIC_BRANCH_NAME=$NEXT_PUBLIC_BRANCH_NAME

RUN mkdir -p packages/branch/src/generated && \
    cp "packages/contracts/deployments/${NEXT_PUBLIC_CHAIN_ID:-11155111}.json" \
       packages/branch/src/generated/deployment.json

RUN pnpm --filter "@zadanie-defi/branch" run build

# ── Stage 2: lean runtime ──────────────────────────────────────────────────────
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
# Runtime secrets (OPERATOR_PRIVATE_KEY, JWT_SECRET, OPERATOR_PIN_HASH) injected
# via docker compose environment — never baked in.
CMD ["node", "packages/branch/server.js"]
