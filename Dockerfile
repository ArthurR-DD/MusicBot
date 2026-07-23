# syntax=docker/dockerfile:1

# ---- Builder: install node deps (compiles native @discordjs/opus) ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Toolchain needed by node-gyp to build @discordjs/opus.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10

# The runtime image ships a system yt-dlp binary, so skip youtube-dl-exec's own
# download. Its postinstall queries api.github.com (60 req/hour unauthenticated),
# which fails on shared CI builder IPs and broke the build. Also build
# @discordjs/opus from source instead of fetching its prebuilt from GitHub.
ENV YOUTUBE_DL_SKIP_DOWNLOAD=1 \
    npm_config_build_from_source=true

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- Runtime: system ffmpeg + yt-dlp, no build toolchain ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# ffmpeg for transcoding + a standalone yt-dlp binary for extraction. Using the
# system binaries (rather than the npm-bundled ones) makes them independently
# updatable — important because YouTube regularly breaks older yt-dlp versions.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
        -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Point the app at the system binaries (read by src/config.ts and src/music/extractor.ts).
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp

# App code + installed dependencies (includes compiled opus and the tsx runtime).
COPY --from=builder /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml tsconfig.json ./
COPY src ./src

# Drop privileges.
RUN useradd --create-home --uid 1001 bot && chown -R bot:bot /app
USER bot

CMD ["node_modules/.bin/tsx", "src/index.ts"]
