# Stage 1: Dependencies
FROM node:20.20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
# Install everything
RUN npm ci

# Stage 2: Builder
FROM node:20.20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Stage 3: Runner
FROM node:20.20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs -G nodejs

# Only prod dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy build output and scripts
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts

# Set correct permissions
RUN mkdir -p .next/cache logs public/uploads && \
    chown -R nextjs:nodejs . /app && \
    chmod +x ./scripts/start.sh

USER nextjs
EXPOSE 3000
CMD ["./scripts/start.sh"]