# syntax=docker/dockerfile:1.7

# -----------------------------------------------------------------------------
# CreatorCanon worker — multi-stage Docker build.
#
# Build context must be the repo `SaaS/` root (so workspace packages resolve).
# Runtime uses `tsx` to execute TypeScript directly. A dedicated `build` stage
# that emits plain JS will land in a later ticket (Epic 5 — worker
# hardening); keeping tsx for MVP shortens the dev -> prod parity.
# -----------------------------------------------------------------------------

############################
# Stage 1 — deps
############################
FROM node:20-alpine AS deps
WORKDIR /app

# Enable Corepack so the pnpm version pinned in package.json is used verbatim.
RUN corepack enable

# Copy only what pnpm needs to resolve the workspace graph, so dep layers
# cache independently of app source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/auth/package.json packages/auth/
COPY packages/config/package.json packages/config/
COPY packages/core/package.json packages/core/
COPY packages/cost-ledger/package.json packages/cost-ledger/
COPY packages/db/package.json packages/db/
COPY packages/pipeline/package.json packages/pipeline/
COPY packages/ui/package.json packages/ui/

# Install only the worker and its transitive workspace deps. `...` pulls in
# every dependency of @creatorcanon/worker across the workspace.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @creatorcanon/worker...

# Now bring in the actual source after deps are resolved.
COPY apps/worker apps/worker
COPY packages packages

############################
# Stage 2 — runtime
############################
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV NODE_OPTIONS=--enable-source-maps
WORKDIR /app

RUN corepack enable \
    && addgroup -S creatorcanon \
    && adduser -S creatorcanon -G creatorcanon

# Copy the fully installed workspace from the deps stage.
COPY --from=deps --chown=creatorcanon:creatorcanon /app /app

USER creatorcanon

# Optional: expose a port placeholder for a future healthcheck server.
# Trigger.dev workers don't bind a port today, but the Railway healthcheck
# in railway.toml expects HTTP — wire this up in a later ticket.
# EXPOSE 3030

# Run via tsx (ESM loader). Matches the `start` script in apps/worker/package.json.
CMD ["node", "--import", "tsx/esm", "apps/worker/src/dev-server.ts"]
