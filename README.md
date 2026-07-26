# Discord Music Bot

A Discord bot that plays audio from a **local music folder** in a voice channel,
with a per-server queue. Built with TypeScript, [discord.js] and
[@discordjs/voice]; `ffmpeg` decodes the files and transcodes them to Opus.

Because everything is played from disk, there is no streaming-site extraction to
break — no rate limits, bot checks, cookies, or tooling that needs constant
updating.

## Commands

| Command         | Description                                            |
| --------------- | ------------------------------------------------------ |
| `/play <query>` | Play a track from the library (with autocomplete).     |
| `/skip`         | Skip the current track.                                |
| `/pause`        | Pause playback.                                        |
| `/resume`       | Resume playback.                                       |
| `/queue`        | Show the current track and what's coming up.           |
| `/stop`         | Stop, clear the queue, and leave the voice channel.    |

Typing in `/play` suggests matching tracks as you go. Matching is
case-insensitive and ignores `_`, `-` and `.`, so `homer` finds
`Homer_Let_The_Barts_Out.mp3`. A multi-word query matches when every word
appears in the file name.

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

## Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io/) — or just Docker.
- `ffmpeg` available on the system (the Docker image installs it for you).
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

> **Voice needs UDP — use a real VM.** Discord audio streams over UDP and the
> host must pass the UDP round-trip. Managed PaaS platforms tend to break it:
> **Railway** blocks it outright, and on **Fly.io** the voice connection stalls
> at `connecting` and never becomes `Ready`. Slash commands still work there
> (that's TCP), but audio won't. A **VPS or EC2 instance** works.

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

### Fly.io (slash commands only — voice does not connect)

Kept for reference; `fly.toml` runs the bot as an outbound-only app. Voice
stalls at `connecting` there, so use a VPS/EC2 for audio.

## Type checking

```bash
pnpm run typecheck
```

[discord.js]: https://discord.js.org/
[@discordjs/voice]: https://discordjs.guide/voice/
