# ===========================================
# Trivia Millionaire - Multi-stage Dockerfile
# ===========================================

# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ 

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/server/package*.json ./packages/server/
COPY packages/admin/package*.json ./packages/admin/
COPY packages/client/package*.json ./packages/client/

# Install all dependencies
RUN npm ci

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
COPY packages/admin ./packages/admin
COPY packages/client ./packages/client
COPY tsconfig.json ./

# Build shared first (dependency for others)
RUN npm run build --workspace=@trivia-millionaire/shared

# Build server
RUN npm run build --workspace=@trivia-millionaire/server

# Build admin and client (they need VITE env vars at build time)
ARG VITE_API_URL
ARG VITE_CLIENT_URL
ARG VITE_ADMIN_URL
ARG VITE_SOLACE_BROKER_URL
ARG VITE_SOLACE_VPN_NAME
ARG VITE_SOLACE_USERNAME
ARG VITE_SOLACE_PASSWORD

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_CLIENT_URL=$VITE_CLIENT_URL
ENV VITE_ADMIN_URL=$VITE_ADMIN_URL
ENV VITE_SOLACE_BROKER_URL=$VITE_SOLACE_BROKER_URL
ENV VITE_SOLACE_VPN_NAME=$VITE_SOLACE_VPN_NAME
ENV VITE_SOLACE_USERNAME=$VITE_SOLACE_USERNAME
ENV VITE_SOLACE_PASSWORD=$VITE_SOLACE_PASSWORD

RUN npm run build --workspace=@trivia-millionaire/admin
RUN npm run build --workspace=@trivia-millionaire/client

# Stage 2: Production server image
FROM node:20-alpine AS server

WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files for production install
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/server/package*.json ./packages/server/

# Install production dependencies only
RUN npm ci --omit=dev --workspace=@trivia-millionaire/shared --workspace=@trivia-millionaire/server

# Copy built files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/

# Create data directory for SQLite
RUN mkdir -p /app/packages/server/data

# Expose server port
EXPOSE 4847

# Run the server
CMD ["node", "packages/server/dist/index.js"]

# Stage 3: Nginx image for static files (admin + client)
FROM nginx:alpine AS nginx

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built static files
COPY --from=builder /app/packages/admin/dist /usr/share/nginx/html/admin
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html/client

# Copy Solace logo and other public assets
COPY --from=builder /app/packages/admin/public /usr/share/nginx/html/admin
COPY --from=builder /app/packages/client/public /usr/share/nginx/html/client

# Expose admin and client ports
EXPOSE 4848 4849

CMD ["nginx", "-g", "daemon off;"]
