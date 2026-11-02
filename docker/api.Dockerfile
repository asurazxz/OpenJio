FROM node:22.21.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@12.16.1
WORKDIR /app/server
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
WORKDIR /app
COPY pipeline/requirements.lock pipeline/requirements.lock
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r pipeline/requirements.lock
COPY server/src server/src
COPY client/src client/src
COPY pipeline pipeline
COPY scripts/run-ingest.mjs scripts/run-ingest.mjs
RUN mkdir -p server/.cache pipeline/out
ENV NODE_ENV=production PYTHONUNBUFFERED=1
WORKDIR /app/server
CMD ["node", "src/index.js"]
