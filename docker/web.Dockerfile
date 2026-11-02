FROM node:22.21.1-alpine3.22 AS build
RUN npm install --global pnpm@12.16.1
WORKDIR /app/client
COPY client/package.json client/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY client/ ./
ENV VITE_DATA_MODE=supabase VITE_API_BASE=/backend
RUN pnpm build
FROM nginx:1.28.0-alpine3.21
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY docker/web.conf /etc/nginx/conf.d/default.conf
COPY docker/web-entrypoint.sh /docker-entrypoint.d/40-openjio-config.sh
RUN chmod +x /docker-entrypoint.d/40-openjio-config.sh
