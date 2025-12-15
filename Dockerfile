# Peta Core Docker Image
FROM node:20-alpine AS base

# Set working directory
WORKDIR /app

# Install necessary system dependencies
RUN apk add --no-cache \
    postgresql-client \
    curl \
    bash

# Build stage
FROM base AS builder

# Copy package.json and lock files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies and generate Prisma Client
RUN npm ci && npx prisma generate

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    postgresql-client \
    curl \
    bash \
    dumb-init \
    docker-cli

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy build results
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/scripts ./scripts

# Install production dependencies
COPY --chown=nodejs:nodejs package*.json ./
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Generate Prisma client and ensure correct permissions
RUN npx prisma generate --schema=./prisma/schema.prisma && \
    chown -R nodejs:nodejs /app/node_modules/.prisma && \
    chmod -R 755 /app/node_modules/.prisma

# Switch to non-root user
USER nodejs

# Environment variables
ENV NODE_ENV=production
ENV BACKEND_PORT=3002

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3002/health || exit 1

# Startup command
CMD ["sh", "-c", "node scripts/unified-db-init.js && node dist/index.js"]
