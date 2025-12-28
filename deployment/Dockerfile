# Build stage
FROM node:20-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build
RUN npm run build:server

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install ONLY express for the production server
# We don't need frontend dependencies (React, etc.) in the runtime image
RUN npm install express@4.18.2 dotenv@17.2.3 && npm cache clean --force

# Copy only the necessary parts from the build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/server-build ./server-build

# Cloud Run expects the container to listen on port 8080 by default
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server-build/server.js"]
