# syntax=docker/dockerfile:1
# Backend image. Build from the backend/ folder:  docker build -t rove-backend backend
# Targets: runtime (the API, the default) and migrate (applies database migrations, then exits).

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
# `npm run build` generates the Prisma client first (prebuild), then compiles.
RUN npm run build

# One-off job: docker run --env-file .env rove-backend-migrate  (needs DATABASE_URL)
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3001
# The process is up (no database check: a platform restarts the container when this fails). Readiness is /api/v1/health/ready.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main"]
