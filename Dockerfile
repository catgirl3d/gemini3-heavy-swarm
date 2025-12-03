# Build stage
FROM node:20-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies (express)
COPY package*.json ./
RUN npm install --only=production

# Copy built assets from build stage
COPY --from=build /app/dist ./dist

# Copy server script
COPY server.js .

# Cloud Run expects the container to listen on port 8080 by default
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]