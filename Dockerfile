# syntax=docker/dockerfile:1

# ---- Builder: install node deps (compiles native @discordjs/opus) ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Toolchain needed by node-gyp to build @discordjs/opus.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10

# Build @discordjs/opus from source rather than fetching its prebuilt binary
# from GitHub, which 404s/rate-limits on shared CI builder IPs.
ENV npm_config_build_from_source=true

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- Runtime: system ffmpeg, no build toolchain ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# ffmpeg decodes the local audio files and transcodes them to Opus.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV FFMPEG_PATH=/usr/bin/ffmpeg
# Default library location; mount your audio folder here (see docker-compose.yml).
ENV MUSIC_DIR=/app/music

# App code + installed dependencies (includes compiled opus and the tsx runtime).
COPY --from=builder /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml tsconfig.json ./
COPY src ./src

# Drop privileges.
RUN useradd --create-home --uid 1001 bot && chown -R bot:bot /app
USER bot

CMD ["node_modules/.bin/tsx", "src/index.ts"]
