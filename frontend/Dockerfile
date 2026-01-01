FROM node:20-alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy application code
COPY . .

# Expose port
EXPOSE 5173

# Health check
HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5173 || exit 1

# Run vite dev server (host 0.0.0.0 for container access)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
