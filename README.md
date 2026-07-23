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

> **Voice needs UDP.** Discord audio streams over UDP, so the host must allow
> outbound UDP. **Railway does not** — text/slash commands work there, but audio
> never connects (the voice connection times out before `Ready`). Use **Fly.io**
> or a **VPS**, both of which pass the required UDP.

### Fly.io

The included `fly.toml` runs the bot as an outbound-only app (no public HTTP
service). Fly.io allows the outbound UDP that Discord voice needs.

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

### VPS (Docker)

Any VPS with Docker works and has full networking:

```bash
docker build -t shoplist-bot .
docker run -d --name shoplist-bot --restart unless-stopped \
  -e DISCORD_TOKEN=your-token \
  -e CLIENT_ID=1529765019699515462 \
  -e GUILD_ID=your-server-id \
  shoplist-bot
```

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
