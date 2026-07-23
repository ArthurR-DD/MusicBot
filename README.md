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

   ```bash
   pnpm run deploy
   ```

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

## Deploying to the cloud (Railway)

This is an always-on gateway bot (voice requires a persistent connection), so it
must run as a long-lived process — not on serverless/FaaS. The included
`Dockerfile` bakes in system `ffmpeg` and a standalone `yt-dlp` binary, and
`railway.json` tells Railway to build from it.

1. Push this repo to GitHub.
2. In [Railway](https://railway.app): **New Project → Deploy from GitHub repo**,
   and select this repository. Railway detects `railway.json` / the `Dockerfile`
   automatically.
3. Under the service's **Variables**, add:
   - `DISCORD_TOKEN` — your bot token (use a freshly reset one; never commit it).
   - `CLIENT_ID` — your application ID.
   - `GUILD_ID` — optional.
   - `FFMPEG_PATH` and `YT_DLP_PATH` are already set inside the image; no need to
     add them.
4. **Register the slash commands once** — this is a one-off, not part of the
   running service. Easiest is to run it locally against the same token:
   ```bash
   pnpm run deploy
   ```
5. Railway builds and starts the container. It restarts on failure
   (`restartPolicyType: ON_FAILURE`).

Keeping `yt-dlp` fresh: YouTube periodically breaks older versions. The image
pulls the latest `yt-dlp` at build time, so **trigger a redeploy** every few
weeks (or when `/play` starts failing) to pick up a new release.

The same `Dockerfile` runs anywhere containers do — Fly.io, a VPS
(`docker run --restart unless-stopped ...`), etc. Only the platform config
(`railway.json`) is Railway-specific.

## Type checking

```bash
pnpm run typecheck
```

[discord.js]: https://discord.js.org/
[@discordjs/voice]: https://discordjs.guide/voice/
[yt-dlp]: https://github.com/yt-dlp/yt-dlp
