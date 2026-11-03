# Myabéshop — one image per app, built from the monorepo.
#   docker build --target api -t myabeshop-api .
#   docker build --target web -t myabeshop-web --build-arg NEXT_PUBLIC_API_URL=https://api.example.com .
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_ROOT_DOMAIN=localhost:3000
ARG NEXT_PUBLIC_WEB_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_ROOT_DOMAIN=$NEXT_PUBLIC_ROOT_DOMAIN NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @myabeshop/shared build && pnpm --filter @myabeshop/api build && pnpm --filter @myabeshop/web build

FROM base AS api
ENV NODE_ENV=production PORT=4000
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 4000
# Applies pending migrations, then starts the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]

FROM base AS web
ENV NODE_ENV=production PORT=3000
COPY --from=build /app /app
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
