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
# from GitHub, which 404s/rate-limits on shared CI builder IPs. Skip
# youtube-dl-exec's own yt-dlp download too: its postinstall queries
# api.github.com (60 req/hour unauthenticated) and the runtime image installs a
# system yt-dlp instead.
ENV npm_config_build_from_source=true \
    YOUTUBE_DL_SKIP_DOWNLOAD=1

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- Runtime: system ffmpeg, no build toolchain ----
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
