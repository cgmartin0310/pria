# Portal Worker — recipe-replay agent with Chromium baked in.
#
# Base image is Microsoft's official Playwright image: Node + Chromium (and
# deps) preinstalled at /ms-playwright. The tag MUST match the playwright-core
# version pinned in package.json (1.49.0) or browser resolution fails.
#
# Build context is the REPO ROOT (see render.yaml dockerContext: .).
FROM mcr.microsoft.com/playwright:v1.49.0-noble

WORKDIR /app
RUN npm install -g pnpm@9

# Workspace manifests first (layer-cached installs).
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages/portal-worker/package.json packages/portal-worker/
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile --filter @pria/portal-worker

# Source + build.
COPY packages/portal-worker packages/portal-worker
RUN pnpm --filter @pria/portal-worker build

WORKDIR /app/packages/portal-worker
CMD ["node", "dist/index.js"]
