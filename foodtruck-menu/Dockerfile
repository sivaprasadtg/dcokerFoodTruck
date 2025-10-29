# Use Node image
FROM node:18-alpine

# Create and use app directory
WORKDIR /app

# Copy only package files first (better caching)
COPY package*.json ./

# Install prod deps
RUN npm ci --omit=dev

# Copy the rest of the source code
COPY . .

# Use a non-root user for security
RUN addgroup -S app && adduser -S app -G app
USER app

# The service listens on 3000
EXPOSE 3000

# Start the server
CMD ["node", "index.js"]
