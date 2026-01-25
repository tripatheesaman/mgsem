# Stage 1: Dependencies
FROM node:18.20-alpine AS deps
WORKDIR /app

# Required libraries
RUN apk add --no-cache libc6-compat netcat-openbsd

# Copy package files first for caching
COPY package.json package-lock.json* tsconfig.json ./
RUN npm ci --only=production

# Stage 2: Builder
FROM node:18.20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry ( kunni k ho  yo stackoverflow jindabaad)
ENV NEXT_TELEMETRY_DISABLED=1

# Build 
RUN npm run build

# Stage 3: Runner
FROM node:18.20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs -G nodejs

# Only for production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts

#Make sure that the runtime directories are writable
RUN mkdir -p .next/cache \
    && chown -R nextjs:nodejs .next public \
    && chmod -R 755 .next public

# Make start.sh executable
RUN chmod +x ./scripts/start.sh

# Uploads Directory
RUN mkdir -p public/uploads \
    && chown -R nextjs:nodejs public/uploads \
    && chmod -R 775 public/uploads

# Logs Directory
RUN mkdir -p logs \
    && chown -R nextjs:nodejs logs \
    && chmod -R 775 logs

USER nextjs

# Expose port
EXPOSE 3000

# Entrypoint
CMD ["./scripts/start.sh"]
