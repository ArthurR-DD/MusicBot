# syntax=docker/dockerfile:1

# ---- Builder: install node dependencies and stage the runtime binaries ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Toolchain for node-gyp, used only if @discordjs/opus has no prebuilt binary
# for this platform and has to be compiled.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@10

# Skip youtube-dl-exec's own yt-dlp download: its postinstall queries
# api.github.com (60 req/hour unauthenticated) and we fetch a release binary
# below instead.
#
# @discordjs/opus is NOT forced to build from source — node-pre-gyp fetches a
# prebuilt binary when one exists (much faster on slow hardware) and falls back
# to compiling automatically when it doesn't.
ENV YOUTUBE_DL_SKIP_DOWNLOAD=1

COPY package.json pnpm-lock.yaml ./
# Cache the pnpm store between builds so unchanged packages are never
# re-downloaded. Requires BuildKit, which docker compose enables by default.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

# Stage ffmpeg. The ffmpeg-static package already downloaded a self-contained
# binary during the install above, so reuse it rather than installing ffmpeg
# from apt in the runtime stage — that pulls ~200 packages (X11, mesa, SDL,
# video codecs) a headless audio bot never touches, and dominates build time
# on modest hardware.
RUN node -e "const fs=require('fs'),p=require('ffmpeg-static');if(!p||!fs.existsSync(p))throw new Error('ffmpeg-static binary missing');fs.copyFileSync(p,'/ffmpeg')" \
    && chmod a+rx /ffmpeg \
    && /ffmpeg -version > /dev/null

# Stage yt-dlp. Its release binaries are per-architecture, and running the
# wrong one fails at exec time with a misleading shell syntax error (the kernel
# rejects the ELF, so libc retries it through /bin/sh) — so pick by TARGETARCH
# and prove the result runs before it reaches the runtime image.
# Bump YTDLP_REFRESH to re-download without rebuilding everything:
#   docker compose build --build-arg YTDLP_REFRESH=$(date +%s)
ARG TARGETARCH
ARG YTDLP_REFRESH=0
RUN set -eu; \
    case "${TARGETARCH:-amd64}" in \
      amd64) asset=yt-dlp_linux ;; \
      arm64) asset=yt-dlp_linux_aarch64 ;; \
      arm) asset=yt-dlp_linux_armv7l ;; \
      *) echo "No yt-dlp build for architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}" -o /yt-dlp; \
    chmod a+rx /yt-dlp; \
    /yt-dlp --version

# ---- Runtime: no apt, no build toolchain ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Separate layers: refreshing yt-dlp then re-copies only its own small layer.
COPY --from=builder /ffmpeg /usr/local/bin/ffmpeg
COPY --from=builder /yt-dlp /usr/local/bin/yt-dlp

ENV FFMPEG_PATH=/usr/local/bin/ffmpeg
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp
# Default library location; mount your audio folder here (see docker-compose.yml).
ENV MUSIC_DIR=/app/music

# Create the user before copying so ownership can be set by COPY --chown.
# Doing it afterwards would mean a recursive chown of node_modules on every
# source change, which is slow on modest hardware.
# setpriv (util-linux) and useradd (passwd) are part of the base image; assert
# setpriv here so a missing binary fails the build rather than the container.
RUN useradd --create-home --uid 1001 bot \
    && command -v setpriv >/dev/null || { echo 'setpriv not found in image'; exit 1; }

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Dependencies change rarely, source changes often — copy them in that order so
# an edit to src/ invalidates only the final, cheap layer.
COPY --chown=bot:bot --from=builder /app/node_modules ./node_modules
COPY --chown=bot:bot package.json pnpm-lock.yaml tsconfig.json ./
COPY --chown=bot:bot src ./src

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node_modules/.bin/tsx", "src/index.ts"]
