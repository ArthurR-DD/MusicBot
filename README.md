# Discord Music Bot

A Discord bot that plays audio in a voice channel from a **local music folder**
or from a **link**, with a per-server queue. Built with TypeScript,
[discord.js] and [@discordjs/voice]; `ffmpeg` decodes the audio and transcodes
it to Opus, and [yt-dlp] handles links.

The local library is the dependable path — files on disk can't be rate-limited
or blocked. Links are a convenience on top of it, and work best when the bot
runs on a home connection (see below).

## Commands

| Command         | Description                                            |
| --------------- | ------------------------------------------------------ |
| `/play <query>` | Play a library track (with autocomplete), or a link.   |
| `/upload <file>` | Add an audio file to the library (attach the file).   |
| `/skip`         | Skip the current track.                                |
| `/pause`        | Pause playback.                                        |
| `/resume`       | Resume playback.                                       |
| `/queue`        | Show the current track and what's coming up.           |
| `/stop`         | Stop, clear the queue, and leave the voice channel.    |

Typing in `/play` suggests matching tracks as you go. Matching is
case-insensitive and ignores `_`, `-` and `.`, so `homer` finds
`Homer_Let_The_Barts_Out.mp3`. A multi-word query matches when every word
appears in the file name.

Paste an `http(s)` link instead and it's streamed directly through yt-dlp — see
[Playing links](#playing-links).

## The music library

Put audio files in the library folder — subfolders are scanned too (up to 8
levels), and hidden/dot files are ignored:

```
music/
├── Homer_Let_The_Barts_Out.mp3
├── Rock/
│   └── Thunder Road.flac
└── Chill/
    └── evening-calm.opus
```

Track names come from the file name, so name files how you want to search them.
Supported extensions: `.mp3`, `.m4a`, `.aac`, `.opus`, `.ogg`, `.oga`, `.flac`,
`.wav`, `.wma`, `.webm`.

The file list is cached for 60s (`LIBRARY_TTL_MS`), so files you add show up
within a minute without restarting the bot.

### Uploads

`/upload` adds a file to the library straight from Discord — attach the audio
file, optionally pass `name` to save it under a different name, and it becomes
playable immediately (the cache is refreshed on upload).

- Audio files are stored as-is. **Video files are accepted too** — the audio
  track is extracted and the video discarded, so only audio is kept (see
  below).
- Files larger than `MAX_UPLOAD_MB` (default 100) are rejected. Discord's own
  attachment limit applies first — 10 MB on a free account, higher with Nitro.
- Names are sanitised: directory components, control characters and
  path-significant characters are stripped, so an upload can only ever land
  inside the library folder. If the name is already taken, ` (2)`, ` (3)`, …
  is appended rather than overwriting.

**Video uploads.** Upload a video and the bot strips the audio out of it,
saving only the sound as an Opus file — the video track is never stored.
Accepted containers: `.mp4`, `.m4v`, `.mkv`, `.mov`, `.avi`, `.webm`, `.flv`,
`.wmv`, `.mpg`, `.mpeg`, `.ts`, `.3gp`.

Extraction runs through ffmpeg and re-encodes to Opus, which is the codec
Discord streams natively, so nothing is converted again at playback. It's quick
(a few seconds for a typical track), but long files take longer — an extraction
is killed after `EXTRACT_TIMEOUT_MS` (default 10 minutes).

**Permissions.** The container's entrypoint takes ownership of the mounted
folder at startup and then drops privileges to an unprivileged user, so no
manual `chown` is needed on the host.

If you'd rather keep the library read-only, change the volume in
`docker-compose.yml` to `./music:/app/music:ro` — `/play` still works, but
`/upload` will report that it can't save.

## Playing links

Pass an `http(s)` URL to `/play` and it's streamed straight through yt-dlp —
nothing is written to the library. Anything yt-dlp supports works, not just
YouTube. Queue position, `/skip`, `/pause` and the rest behave the same as for
local tracks; `/queue` marks streamed entries with 🔗.

**Run it on a home connection.** Sites routinely challenge requests from
datacenter IP ranges — the "confirm you're not a bot" wall — which makes link
playback unreliable on cloud hosts (AWS, most VPS providers). A residential
connection generally isn't subject to that, so self-hosting is what makes this
feature dependable.

**Keep yt-dlp current.** Sites change and older versions break. The Docker image
fetches the latest release at build time, so rebuild periodically:

```bash
docker compose build --build-arg YTDLP_REFRESH=$(date +%s) && docker compose up -d
```

That re-downloads yt-dlp while leaving every other cached layer intact — much
faster than `--no-cache`, which throws away the whole image. To update without
rebuilding at all, let yt-dlp update itself in the running container:

```bash
docker compose exec -u root bot yt-dlp -U
```

(that lasts until the next rebuild, which restores the image's own copy).

If a link fails, the bot logs the underlying `[yt-dlp]` error. The usual fixes,
all optional environment variables (see `.env.example`):

| Variable | Use |
| --- | --- |
| `YT_DLP_COOKIES` | Path to a Netscape `cookies.txt` when a site wants a signed-in session. |
| `YT_DLP_PROXY` | Route requests through a proxy (residential/mobile — datacenter proxies get blocked too). |
| `YT_DLP_EXTRACTOR_ARGS` | Site-specific tweaks, e.g. `youtube:player_client=tv`. |
| `YT_DLP_FORMAT` | Override the format selector (default `bestaudio/best`). |

For anything you play often, `/upload` it (or drop the file in the library)
instead — local files never break.

## Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io/) — or just Docker.
- `ffmpeg` available on the system (in Docker this comes from the
  `ffmpeg-static` package, no install needed).
- `yt-dlp` on `PATH` or at `YT_DLP_PATH`, for link playback (the Docker image
  installs it; outside Docker, `youtube-dl-exec` bundles one).
- A Discord application with a bot user
  ([Developer Portal](https://discord.com/developers/applications)).

## Setup

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Configure the bot**

   ```bash
   cp .env.example .env
   ```

   - `DISCORD_TOKEN` — Bot → Reset Token.
   - `CLIENT_ID` — General Information → Application ID.
   - `GUILD_ID` — optional; a server ID registers commands instantly.
   - `MUSIC_DIR` — folder to scan. Defaults to `/app/music` (the path used
     inside Docker); set it to a real path when running locally, e.g.
     `MUSIC_DIR=/home/you/Music`.

3. **Register the slash commands**

   The bot registers its commands automatically on startup. To do it manually as
   a one-off:

   ```bash
   pnpm run deploy
   ```

   Commands register to `GUILD_ID` if set (instant), otherwise globally (up to
   ~1 hour to appear).

4. **Invite the bot**

   Developer Portal → OAuth2 → URL Generator: select the `bot` and
   `applications.commands` scopes plus the **Connect** and **Speak** voice
   permissions, then open the generated URL.

   No privileged intents are required.

## Running

```bash
pnpm run dev     # watch mode (auto-restart on changes)
pnpm start       # run once
```

Join a voice channel and run `/play`.

## Deploying

This is an always-on gateway bot (voice needs a persistent connection), so it
must run as a long-lived process — not on serverless/FaaS.

> **Keep `@discordjs/voice` current.** Discord's voice gateway now negotiates
> the DAVE (end-to-end encryption) protocol, which older versions of the library
> don't implement. On an outdated version the connection loops
> `connecting -> signalling` and times out before `Ready` — the bot joins the
> channel but plays nothing, on any host. If that happens, upgrade
> `@discordjs/voice` (and `@discordjs/opus`) before suspecting the network.
>
> Voice audio also travels over UDP, so the host must allow outbound UDP. A VPS
> or EC2 instance with default security groups does.

### VPS / AWS EC2

Provision a small **amd64** instance (1 vCPU / 1 GB RAM is plenty; e.g. AWS
`t3.micro`, Hetzner `CX22`), install Docker, then:

```bash
git clone https://github.com/ArthurR-DD/ShopList.git
cd ShopList
cp .env.example .env         # fill in DISCORD_TOKEN, CLIENT_ID, GUILD_ID
mkdir -p music               # then copy your audio files in (see below)
docker compose up -d --build
docker compose logs -f
```

`docker-compose.yml` mounts `./music` read-only at `/app/music`. To keep files
elsewhere, change the left-hand side of that volume mapping.

Copy audio up from your machine with `scp`:

```bash
scp -i your-key.pem -r ~/Music/* ubuntu@<instance-ip>:~/ShopList/music/
```

The only inbound port you need is SSH (22); the bot makes only outbound
connections. On a 1 GB instance, add swap first:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Mind your disk: audio files count against the instance's volume, so size it for
your library.

Update later with `git pull && docker compose up -d --build`.

### Faster deploys on modest hardware

The build is layered so day-to-day updates stay cheap. What to run:

| Situation | Command | Cost |
| --- | --- | --- |
| Changed only `src/` | `docker compose up -d --build` | Rebuilds one small layer |
| Changed `src/`, with `./src` mounted (below) | `docker compose restart` | No build at all |
| Changed dependencies | `docker compose up -d --build` | Reinstalls; pnpm store is cached |
| Refreshing yt-dlp | `docker compose build --build-arg YTDLP_REFRESH=$(date +%s)` | Re-downloads one binary |
| Refreshing yt-dlp, no build | `docker compose exec -u root bot yt-dlp -U` | Nothing rebuilt |

What keeps this quick, worth knowing if you edit the setup:

- **`music/` is excluded from the build context** via `.dockerignore`. Without
  it the whole library is sent to the Docker daemon on every build — easily the
  slowest part once you have a few GB of audio.
- **Dependencies are copied before source**, so editing `src/` invalidates only
  the last layer. Ownership is applied with `COPY --chown` instead of a
  recursive `chown`, which would otherwise re-run over `node_modules` on every
  code change.
- **The pnpm store is cached** between builds with a BuildKit cache mount, so
  unchanged packages are never re-downloaded.
- **`@discordjs/opus` prefers a prebuilt binary**, compiling from source only if
  none exists for the platform — compiling costs minutes on slow hardware.
- **The runtime image installs nothing from apt.** `ffmpeg` is the static binary
  the `ffmpeg-static` package already downloads during install, and `yt-dlp` is
  a self-contained release binary fetched with node — both staged in the builder
  and copied in. Installing `ffmpeg` from apt instead pulls ~200 packages (X11,
  mesa, SDL, video codecs) that a headless audio bot never uses, and is usually
  the single slowest step of a cold build.

**Skip rebuilds entirely for code changes:** uncomment the `./src:/app/src:ro`
volume in `docker-compose.yml`. The bot runs TypeScript directly through `tsx`,
so after a `git pull` a `docker compose restart` is enough.

If a build ever gets wedged, `docker builder prune` clears the build cache and
frees disk.

### Fly.io

`fly.toml` runs the bot as an outbound-only app (no `[http_service]` — a
health-checked port the bot doesn't serve makes Fly restart the machine in a
loop). Voice was untested here after the `@discordjs/voice` upgrade; the earlier
failures on this platform matched the DAVE issue described above, not
necessarily the network.

### Auto-deploying on merge to main

A home server normally has no inbound access, so GitHub can't call it — a
webhook has nothing to reach. Instead the server checks GitHub itself: a timer
polls for new commits on `main` and redeploys when it sees one. Nothing is
exposed to the internet and no credentials are given to GitHub.

`deploy/auto-deploy.sh` does the work — fetch, compare, fast-forward, rebuild,
prune. It exits immediately when there's nothing new, so a frequent poll is
cheap. Install the units:

```bash
cd ~/ShopList
sudo cp deploy/shoplist-deploy.{service,timer} /etc/systemd/system/
sudo sed -i "s/USER/$USER/g" /etc/systemd/system/shoplist-deploy.service
sudo systemctl daemon-reload
sudo systemctl enable --now shoplist-deploy.timer
```

Then merge a PR and wait a few minutes. To watch it:

```bash
systemctl list-timers shoplist-deploy.timer   # when it next runs
journalctl -u shoplist-deploy.service -f      # what it did
sudo systemctl start shoplist-deploy.service  # trigger a check now
```

Adjust `OnUnitActiveSec` in the timer to poll more or less often. The script:

- **refuses to run unless the checkout is on `main`**, so it can't fast-forward
  over work in progress;
- **uses `--ff-only`**, failing rather than creating a merge commit if the
  checkout has diverged or has uncommitted changes to tracked files;
- **holds a lock**, so a slow build never overlaps the next tick.

Two things that will silently stop deploys: a **fine-grained PAT expiring** (the
token is baked into the clone URL — `git fetch` starts failing, visible in
`journalctl`), and the repository being left on another branch after manual
work.

If you'd rather have deploys land in seconds, install a **GitHub Actions
self-hosted runner** on the machine instead — it dials out to GitHub, so it also
needs no inbound access. It's more moving parts, and it lets GitHub workflows
execute on your machine, which is worth weighing for a private server.

## Type checking

```bash
pnpm run typecheck
```

[discord.js]: https://discord.js.org/
[@discordjs/voice]: https://discordjs.guide/voice/
[yt-dlp]: https://github.com/yt-dlp/yt-dlp
