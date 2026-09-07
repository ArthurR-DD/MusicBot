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
| `/skip`         | Skip the current track.                                |
| `/pause`        | Pause playback.                                        |
| `/resume`       | Resume playback.                                       |
| `/queue`        | Show the current track and what's coming up.           |
| `/radio`        | Shuffle-play the server's most played links.            |
| `/stop`         | Stop, clear the queue, and leave the voice channel.    |
| `/sound <user>` | Play a server soundboard sound in that person's voice channel. |
| `/prout [user]` | Mark someone; their commands get a GIF. No user lists the marked. |

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

### Adding files

Copy audio into the library folder on the host — the bot has no command for
adding files, so nothing can write to it from Discord:

```bash
scp -i your-key.pem -r ~/Music/* user@host:~/MusicBot/music/
```

New files are picked up within `LIBRARY_TTL_MS` (60s by default), so there's no
need to restart the bot.

To add the audio from a video file, strip it with ffmpeg first — Opus is what
Discord streams natively, so storing it avoids a conversion at playback:

```bash
ffmpeg -i video.mp4 -vn -c:a libopus -b:a 160k "music/Track Name.opus"
```

If you want the container to be unable to write to the library at all, change
the volume in `docker-compose.yml` to `./music:/app/music:ro`. Playback is
unaffected.

## Playing links

Pass an `http(s)` URL to `/play` and it's streamed straight through yt-dlp —
nothing is written to the library. Anything yt-dlp supports works, not just
YouTube. Queue position, `/skip`, `/pause` and the rest behave the same as for
local tracks; `/queue` marks streamed entries with 🔗.

The reply is an embed showing the video thumbnail, its length, the channel and
who requested it, with the title linking back to the source. Missing metadata is
simply left out — a stream with no duration shows `live`. Library tracks keep a
plain text reply, since a local file carries none of that.

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

If the self-hosted deploy is set up, the easiest route is the **Run workflow**
button on the CI workflow (Actions -> CI -> Run workflow, branch `main`). It
leaves `Download the latest yt-dlp` ticked by default, so it redeploys the
current `main` with a fresh yt-dlp and no commit needed. A push-triggered deploy
deliberately leaves that layer cached, so merging a PR does *not* update yt-dlp.
Either way the deploy log ends with the yt-dlp version that actually shipped.

If a link fails, the bot logs the underlying `[yt-dlp]` error. The usual fixes,
all optional environment variables (see `.env.example`):

| Variable | Use |
| --- | --- |
| `YT_DLP_COOKIES` | Path to a Netscape `cookies.txt` when a site wants a signed-in session. |
| `YT_DLP_PROXY` | Route requests through a proxy (residential/mobile — datacenter proxies get blocked too). |
| `YT_DLP_EXTRACTOR_ARGS` | Site-specific tweaks, e.g. `youtube:player_client=tv`. |
| `YT_DLP_FORMAT` | Override the format selector (default `bestaudio/best`). |

For anything you play often, put a copy in the library instead — local files
never break.

### Radio

`/radio` queues the server's most played links from the last 7 days, shuffled.

Every `/play` of a link is recorded; nothing else is. In particular `/radio`'s
own queueing is deliberately not counted — otherwise replaying a popular track
would inflate the very ranking that picked it, and the station would narrow to a
handful of songs.

History lives in `.play-history.json` inside the music folder. That volume is
already writable and survives rebuilds, and the library scanner ignores
dot-files, so it never shows up as a track. Records outside the window are
pruned on write, so the file stays small.

| Variable | Default | Meaning |
| --- | --- | --- |
| `HISTORY_WINDOW_DAYS` | `7` | How far back the radio looks. |
| `RADIO_SIZE` | `25` | How many distinct tracks it queues. |
| `HISTORY_FILE` | `<MUSIC_DIR>/.play-history.json` | Where history is stored. |

Counts are per server, so one guild's listening never feeds another's radio.

## Soundboard (`/sound`)

`/sound @someone` targets a person, then privately offers a menu of the
server's soundboard sounds. Pick one and the bot joins **their** voice channel
and fires it there.

Soundboard sounds are mixed by Discord's clients rather than by the bot's audio
player, so a sound plays *over* whatever is in the queue without pausing or
interrupting it.

A bot only gets one voice connection per server, which shapes the behaviour:

- Already in the target's channel → the sound is sent, the connection untouched.
- In another channel with music playing → the command refuses, rather than
  yanking the bot across and cutting the music.
- Not connected → it joins, fires the sound, and leaves a few seconds later
  unless something started playing meanwhile.

The bot needs **Use Soundboard** and **Speak** in that channel, plus **Use
External Sounds** for a sound from another server. Discord caps a select menu at
25 entries, so a server with more sounds than that gets the first 25 and a note.

## Marks (`/prout`)

`/prout @someone` marks that person. From then on, every command they run is
followed by a GIF. Running it again on the same person removes the mark, and
`/prout` with no argument privately lists who is currently marked.

Set `PROUT_GIF_URL` to whichever GIF you want — a bare Tenor or Giphy link is
unfurled by Discord into a playing GIF, so paste the link itself rather than a
direct file URL. With nothing set it falls back to 💨, so the feature works
before you've picked one.

Marks are stored per server in `.marks.json` next to the play history, so they
survive restarts and redeploys, and the dot-file is invisible to the library
scanner. Bots can't be marked.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PROUT_GIF_URL` | *(unset → 💨)* | What gets posted after a marked user's command. |
| `MARKS_FILE` | `<MUSIC_DIR>/.marks.json` | Where marks are stored. |

Posting it is best-effort: if it fails, the command it followed is unaffected.

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
git clone https://github.com/ArthurR-DD/MusicBot.git
cd MusicBot
cp .env.example .env         # fill in DISCORD_TOKEN, CLIENT_ID, GUILD_ID
mkdir -p music               # then copy your audio files in (see below)
docker compose up -d --build
docker compose logs -f
```

`docker-compose.yml` mounts `./music` read-only at `/app/music`. To keep files
elsewhere, change the left-hand side of that volume mapping.

Copy audio up from your machine with `scp`:

```bash
scp -i your-key.pem -r ~/Music/* ubuntu@<instance-ip>:~/MusicBot/music/
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
| Refreshing yt-dlp, remotely | Actions -> CI -> Run workflow | Re-downloads one binary |
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
cd ~/MusicBot
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

### Deploying via a self-hosted Actions runner

The alternative to polling: a runner on the machine dials out to GitHub and
picks up jobs, so it needs no inbound access either. Deploys land in seconds,
and — the real benefit — the `deploy` job in `.github/workflows/ci.yml` declares
`needs: check`, so **a commit that fails typecheck or tests never reaches the
bot**.

1. **Register.** Repo → Settings → Actions → Runners → New self-hosted runner.
   Choose Linux and the architecture `uname -m` reports (`aarch64` → ARM64).
   Follow the commands GitHub shows; the token expires in about an hour. Give it
   the `bot-host` label the workflow expects:

   ```bash
   ./config.sh --url https://github.com/ArthurR-DD/MusicBot \
     --token <REGISTRATION_TOKEN> --labels self-hosted,bot-host
   ```

2. **Run it as a service** so it survives reboots:

   ```bash
   sudo ./svc.sh install && sudo ./svc.sh start
   ```

3. **Grant Docker access:** `sudo usermod -aG docker $USER`, then log out and in.

4. **Enable the job.** Settings → Secrets and variables → Actions → Variables,
   set `SELF_HOSTED_DEPLOY` to `true`. The job is skipped until then, so the
   workflow can sit in `main` harmlessly before a runner exists. Set `DEPLOY_DIR`
   only if the clone isn't at `$HOME/MusicBot` — the job falls back to
   `$HOME/ShopList` (the pre-rename name) when that's what exists, so either
   layout works without configuration.

5. **Turn off polling**, or both will deploy and you'll build twice:

   ```bash
   sudo systemctl disable --now shoplist-deploy.timer
   ```

The job deploys the existing clone rather than the runner's workspace — that
clone holds your `.env` and `music/`, which a fresh checkout wouldn't — and uses
`--ff-only`, so a dirty or diverged checkout stops the deploy rather than being
rewritten.

**Weigh the access this grants.** Anyone who can push to or merge into the
repository can run arbitrary commands on the machine, and membership of the
`docker` group is effectively root. That's reasonable for a private, single-user
repository; it is not something to attach to a public one, where fork pull
requests can run workflow code.

## Checks

```bash
pnpm run typecheck   # tsc --noEmit
pnpm test            # node:test via tsx
```

Both run on every pull request and every push to `main` (`.github/workflows/ci.yml`),
on GitHub-hosted runners — nothing touches the self-hosted machine.

The tests use Node's built-in runner, so there's no test framework to install.
They cover the logic that fails quietly rather than loudly:

- **`filenames.test.ts`** — file-name sanitising, including traversal payloads
  (`../../etc/passwd`, `..`, absolute paths, Windows paths, control characters),
  that ordinary names keep their spaces and hyphens, and that collisions get a
  ` (2)` suffix instead of overwriting.
- **`urls.test.ts`** — which `/play` queries are treated as links versus library
  searches, including that an autocomplete file path is never mistaken for a link.
- **`library.test.ts`** — the scanner against a fixture directory (nested
  folders, dot-files and non-audio ignored, depth limit) and the ranking rules.
- **`track.test.ts`** — duration formatting, including the hour rollover and the
  `live` case for unknown durations.

Playback itself isn't covered: verifying that audio actually reaches a voice
channel needs a live Discord connection and a second client listening, which
isn't worth automating. Check that by hand with `/play` after deploying.

[discord.js]: https://discord.js.org/
[@discordjs/voice]: https://discordjs.guide/voice/
[yt-dlp]: https://github.com/yt-dlp/yt-dlp
