# Discord Music Bot

A Discord bot that plays audio from YouTube links (or search terms) in a voice
channel, with a per-server queue. Built with TypeScript, [discord.js], and
[@discordjs/voice], using [yt-dlp] (via `youtube-dl-exec`) for audio extraction
and a bundled `ffmpeg-static` binary for transcoding — no system-wide ffmpeg or
yt-dlp install required.

## Commands

| Command          | Description                                             |
| ---------------- | ------------------------------------------------------- |
| `/play <query>`  | Play a YouTube URL, or search YouTube for the terms.    |
| `/skip`          | Skip the current track.                                 |
| `/pause`         | Pause playback.                                         |
| `/resume`        | Resume playback.                                        |
| `/queue`         | Show the current track and what's coming up.            |
| `/stop`          | Stop, clear the queue, and leave the voice channel.     |

## Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io/).
- A Discord application with a bot user
  ([Developer Portal](https://discord.com/developers/applications)).

## Setup

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Configure the bot**

   Copy the example env file and fill in your values:

   ```bash
   cp .env.example .env
   ```

   - `DISCORD_TOKEN` — Bot → Reset Token.
   - `CLIENT_ID` — General Information → Application ID.
   - `GUILD_ID` — optional; set a server ID to register commands instantly
     during development. Leave empty to register globally.

3. **Register the slash commands**

   The bot registers its commands automatically on startup, so normally you
   don't need to do anything here. To register them manually as a one-off (e.g.
   without starting the bot):

   ```bash
   pnpm run deploy
   ```

   Commands register to `GUILD_ID` if set (instant), otherwise globally (can
   take up to ~1 hour to appear).

4. **Invite the bot**

   In the Developer Portal → OAuth2 → URL Generator, select the
   `bot` and `applications.commands` scopes, and the **Connect** and **Speak**
   voice permissions. Open the generated URL to add the bot to your server.

   No privileged intents are required.

## Running

```bash
pnpm run dev     # watch mode (auto-restart on changes)
pnpm start       # run once
```

Join a voice channel and run `/play <youtube url>`.

## Deploying to the cloud

This is an always-on gateway bot (voice requires a persistent connection), so it
must run as a long-lived process — not on serverless/FaaS. The included
`Dockerfile` bakes in system `ffmpeg` and a standalone `yt-dlp` binary.

> **Voice needs UDP — use a real VM.** Discord audio streams over UDP, and the
> host must pass the UDP round-trip. Managed PaaS platforms tend to break it via
> their NAT layers: **Railway** blocks it outright, and **Fly.io** reaches
> `connecting` but the UDP IP-discovery reply never returns, so the connection
> never becomes `Ready`. Slash commands still work on those (that's TCP), but
> audio won't. A **VPS or EC2 instance** (below) has full networking and works.

### Fly.io (slash commands only — voice does not connect)

> Kept for reference. In testing the voice connection stalled at `connecting`
> and timed out, so **Fly.io is not recommended for the audio features** — use a
> VPS/EC2 instead. The `fly.toml` runs the bot as an outbound-only app.

1. Install the CLI and sign in: `fly auth login` (or `flyctl auth login`).
2. Create the app from the bundled config (does not deploy yet):
   ```bash
   fly launch --copy-config --no-deploy
   ```
   Accept a unique app name and pick a region close to you.
3. Set secrets / config (these become environment variables):
   ```bash
   fly secrets set DISCORD_TOKEN=your-token CLIENT_ID=1529765019699515462 GUILD_ID=your-server-id
   ```
4. Deploy:
   ```bash
   fly deploy
   ```
5. Watch it come up: `fly logs`. You should see `Logged in as …` and
   `Registered N guild command(s) …`. Join a voice channel and `/play`.

`FFMPEG_PATH` and `YT_DLP_PATH` are already set inside the image — no need to add
them as secrets.

### VPS / AWS EC2 (recommended for voice)

A plain virtual machine with a public IP (a VPS, or an AWS EC2 instance) has
full networking, so Discord's voice UDP works — unlike managed PaaS platforms
(Railway, Fly.io) whose NAT layers break the voice UDP round-trip. This is the
recommended way to host the bot.

Provision a small **amd64** instance (1 vCPU / 1 GB RAM is enough; e.g. AWS
`t3.micro`, Hetzner `CX22`), install Docker, then:

```bash
git clone https://github.com/ArthurR-DD/ShopList.git
cd ShopList
cp .env.example .env         # fill in DISCORD_TOKEN, CLIENT_ID, GUILD_ID
docker compose up -d --build
docker compose logs -f
```

The only inbound port you need is SSH (22) for yourself; the bot makes only
outbound connections. On a 1 GB instance, add a swap file first to be safe:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Update later with `git pull && docker compose up -d --build`.

### YouTube cookies (fixing "confirm you're not a bot")

On cloud/datacenter IPs (AWS, most VPS hosts) YouTube frequently refuses
playback with *"Sign in to confirm you're not a bot"*. yt-dlp then returns no
audio. The fix is to authenticate yt-dlp with cookies from a logged-in account.

1. **Use a throwaway Google account**, not your main one — accounts used for
   automated access from a datacenter IP can get flagged or banned.
2. In a browser signed in to that account, export a **Netscape-format
   `cookies.txt`** for `youtube.com` using an extension like
   *"Get cookies.txt LOCALLY"* (Chrome/Firefox). Tip: export from a private/
   incognito window and close it right after — YouTube rotates cookies, and
   continuing to browse can invalidate the exported set.
3. Copy `cookies.txt` into the `ShopList` directory on the server (it's
   git-ignored). With docker-compose, uncomment the `environment:` and
   `volumes:` blocks in `docker-compose.yml`, then:
   ```bash
   docker compose up -d --build
   ```
   For a bare `docker run`, mount it and set the env var:
   ```bash
   docker run -d --name shoplist-bot --restart unless-stopped \
     --env-file .env -e YT_DLP_COOKIES=/app/cookies.txt \
     -v "$PWD/cookies.txt:/app/cookies.txt:ro" shoplist-bot
   ```

Cookies expire, so you may need to re-export them periodically. An alternative
to cookies is routing yt-dlp through a residential proxy, but cookies are the
simplest fix.

### Keeping yt-dlp fresh

YouTube periodically breaks older `yt-dlp` versions. The image pulls the latest
`yt-dlp` at build time, so **rebuild/redeploy** every few weeks (or when `/play`
starts failing) to pick up a new release.

## Type checking

```bash
pnpm run typecheck
```

[discord.js]: https://discord.js.org/
[@discordjs/voice]: https://discordjs.guide/voice/
[yt-dlp]: https://github.com/yt-dlp/yt-dlp
