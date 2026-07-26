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
COPY docker-entrypoint.sh /usr/local/bin/

# The entrypoint fixes ownership of the mounted library, then drops privileges
# to this user. setpriv comes from util-linux; assert it at build time so a
# missing binary fails the build loudly instead of at container start.
RUN useradd --create-home --uid 1001 bot \
    && chown -R bot:bot /app \
    && chmod +x /usr/local/bin/docker-entrypoint.sh \
    && command -v setpriv >/dev/null || { echo 'setpriv not found in image'; exit 1; }

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node_modules/.bin/tsx", "src/index.ts"]
