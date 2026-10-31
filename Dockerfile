# ==========================================
# Stage 1: Build & Verification Environment
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (utilizing Docker layer caching)
COPY package*.json ./
RUN npm ci

# Copy source code and config
COPY . .

# Run test suite to guarantee 100% test pass before building
RUN npm test -- --run

# Build optimized production bundle
RUN npm run build

# ==========================================
# Stage 2: Production Nginx High-Performance Server
# ==========================================
FROM nginx:alpine AS runner

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy custom SPA Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy production artifacts from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose standard HTTP port
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
