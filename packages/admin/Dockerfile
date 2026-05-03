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
COPY packages/admin     ./packages/admin

# Ensure package-local node_modules exist for the build step
RUN pnpm --filter "@zadanie-defi/admin" install --frozen-lockfile

ARG NEXT_PUBLIC_CHAIN_ID=11155111
ARG NEXT_PUBLIC_RPC_URL
ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL

RUN mkdir -p packages/admin/src/generated && \
    cp "packages/contracts/deployments/${NEXT_PUBLIC_CHAIN_ID:-11155111}.json" \
       packages/admin/src/generated/deployment.json

RUN pnpm --filter "@zadanie-defi/admin" run build

# ── Stage 2: lean runtime ──────────────────────────────────────────────────────
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
