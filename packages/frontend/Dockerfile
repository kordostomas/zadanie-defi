# ---- stage 1: install deps ------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/contracts/package.json ./packages/contracts/

# Install only what the frontend needs (including its workspace deps)
RUN pnpm install --frozen-lockfile --filter "@zadanie-defi/frontend..."

# ---- stage 2: build -------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app /app

# Source files
COPY packages/contracts ./packages/contracts
COPY packages/frontend  ./packages/frontend

# Target chain for the deployment JSON lookup
ARG NEXT_PUBLIC_CHAIN_ID=11155111
ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID

# Generate src/generated/deployment.json from the committed deployments/ folder
RUN pnpm --filter "@zadanie-defi/frontend" run sync:abi

# Build Next.js (standalone output)
RUN pnpm --filter "@zadanie-defi/frontend" run build

# ---- stage 3: lean runtime ------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# standalone output bundles node_modules and server.js
COPY --from=builder --chown=appuser:appgroup /app/packages/frontend/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/packages/frontend/.next/static \
     ./packages/frontend/.next/static
COPY --from=builder --chown=appuser:appgroup /app/packages/frontend/public \
     ./packages/frontend/public

USER appuser
EXPOSE 3000
ENV PORT=3000
CMD ["node", "packages/frontend/server.js"]
