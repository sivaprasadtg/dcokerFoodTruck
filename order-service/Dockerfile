FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install deps (production only)
RUN npm ci --omit=dev

# Copy source
COPY . .

# Security: run as non-root user
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 4000
CMD ["node", "index.js"]
