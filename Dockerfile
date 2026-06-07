FROM node:20-bullseye-slim

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace config and package.json files first for caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY server/package.json ./server/
COPY packages/drmshield-server/package.json ./packages/drmshield-server/

# Install dependencies for the workspace
RUN pnpm install --frozen-lockfile

# Copy the rest of the relevant source code
COPY server/ ./server/
COPY packages/drmshield-server/ ./packages/drmshield-server/

# Build the packages
RUN pnpm --filter @drmshield/server build
RUN pnpm --filter secure-video-server build

# Set working directory to the server for execution
WORKDIR /app/server
EXPOSE 5000
CMD ["pnpm", "start"]
