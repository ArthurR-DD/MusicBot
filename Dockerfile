# syntax=docker/dockerfile:1

# ---- Builder: install node dependencies ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Toolchain for node-gyp, used only if @discordjs/opus has no prebuilt binary
# for this platform and has to be compiled.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10

# Skip youtube-dl-exec's own yt-dlp download: its postinstall queries
# api.github.com (60 req/hour unauthenticated) and the runtime image installs a
# system yt-dlp instead.
#
# @discordjs/opus is NOT forced to build from source — node-pre-gyp fetches a
# prebuilt binary when one exists (much faster on a slow machine) and falls
# back to compiling automatically when it doesn't.
ENV YOUTUBE_DL_SKIP_DOWNLOAD=1

COPY package.json pnpm-lock.yaml ./
# Cache the pnpm store between builds so unchanged packages are never
# re-downloaded. Requires BuildKit, which docker compose enables by default.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

# ---- Runtime: system ffmpeg + yt-dlp, no build toolchain ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# ffmpeg decodes audio and transcodes to Opus. yt-dlp streams links passed to
# /play — installed as a standalone binary so it can be updated independently
# of the npm package (sites change often and older versions break).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
        -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp
# Default library location; mount your audio folder here (see docker-compose.yml).
ENV MUSIC_DIR=/app/music

# Create the user before copying so ownership can be set by COPY --chown.
# Doing it afterwards would mean a recursive chown of node_modules on every
# source change, which is slow on modest hardware.
# setpriv (from util-linux) is asserted here so a missing binary fails the
# build loudly rather than at container start.
RUN useradd --create-home --uid 1001 bot \
    && command -v setpriv >/dev/null || { echo 'setpriv not found in image'; exit 1; }

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Dependencies change rarely, source changes often — copy them in that order so
# an edit to src/ only invalidates the final, cheap layer.
COPY --chown=bot:bot --from=builder /app/node_modules ./node_modules
COPY --chown=bot:bot package.json pnpm-lock.yaml tsconfig.json ./
COPY --chown=bot:bot src ./src

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node_modules/.bin/tsx", "src/index.ts"]
