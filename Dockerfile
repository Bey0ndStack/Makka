FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

FROM base AS dependencies
COPY package.json package-lock.json* ./
RUN npm ci

FROM dependencies AS development
ENV NODE_ENV=development
COPY . .
RUN DATABASE_URL=postgresql://makkah:build-only@localhost:5432/makkah?schema=public npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

FROM dependencies AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN DATABASE_URL=postgresql://makkah:build-only@localhost:5432/makkah?schema=public npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/prisma ./prisma
USER node
EXPOSE 3000
CMD ["node", "server.js"]
