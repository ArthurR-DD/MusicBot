import {
  AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
  type DiscordGatewayAdapterCreator,
} from '@discordjs/voice';
import { createReadStream } from 'node:fs';
import type { VoiceBasedChannel } from 'discord.js';
import type { Track } from './track';

const EMPTY_LEAVE_DELAY = 30_000;

/**
 * Per-guild playback state: one voice connection, one audio player, and a FIFO
 * queue of tracks. Disposes itself (and invokes onDestroy) when idle.
 */
export class GuildQueue {
  readonly guildId: string;
  current?: Track;

  private readonly connection: VoiceConnection;
  private readonly player: AudioPlayer;
  private readonly onDestroy: (guildId: string) => void;
  private tracks: Track[] = [];
  private destroyed = false;
  private leaveTimer?: NodeJS.Timeout;

  constructor(channel: VoiceBasedChannel, onDestroy: (guildId: string) => void) {
    this.guildId = channel.guild.id;
    this.onDestroy = onDestroy;
    this.player = createAudioPlayer();
    this.connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
    });
    this.connection.subscribe(this.player);
    this.attachListeners();
  }

  /**
   * Add a track. Returns 0 if it starts playing immediately, otherwise its
   * 1-based position in the pending queue.
   */
  enqueue(track: Track): number {
    if (!this.current && this.tracks.length === 0) {
      this.tracks.push(track);
      void this.processQueue();
      return 0;
    }
    this.tracks.push(track);
    return this.tracks.length;
  }

  /** Tracks waiting to be played (excludes the current one). */
  get pending(): readonly Track[] {
    return this.tracks;
  }

  skip(): boolean {
    if (!this.current) return false;
    // Stopping the player triggers the Idle handler, which advances the queue.
    this.player.stop(true);
    return true;
  }

  pause(): boolean {
    return this.player.pause(true);
  }

  resume(): boolean {
    return this.player.unpause();
  }

  stop(): void {
    this.tracks = [];
    this.destroy();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.leaveTimer) clearTimeout(this.leaveTimer);
    this.player.stop(true);
    try {
      this.connection.destroy();
    } catch {
      // Connection may already be destroyed.
    }
    this.onDestroy(this.guildId);
  }

  private attachListeners(): void {
    // Diagnostics: surface voice connection / player state transitions so
    // playback failures (e.g. a connection stuck before Ready) are visible.
    this.connection.on('stateChange', (oldState, newState) => {
      console.log(`[voice:${this.guildId}] connection ${oldState.status} -> ${newState.status}`);
    });
    this.connection.on('error', (error) => {
      console.error(`[voice:${this.guildId}] connection error:`, error);
    });
    this.player.on('stateChange', (oldState, newState) => {
      console.log(`[voice:${this.guildId}] player ${oldState.status} -> ${newState.status}`);
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.current = undefined;
      void this.processQueue();
    });

    this.player.on('error', (error) => {
      console.error(`Audio player error in guild ${this.guildId}:`, error.message);
      this.current = undefined;
      void this.processQueue();
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        // Reconnecting on its own — do nothing.
      } catch {
        this.destroy();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.destroyed) return;

    const next = this.tracks.shift();
    if (!next) {
      this.scheduleLeave();
      return;
    }

    if (this.leaveTimer) {
      clearTimeout(this.leaveTimer);
      this.leaveTimer = undefined;
    }

    this.current = next;
    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
      // ffmpeg (via @discordjs/voice) decodes the file and transcodes to Opus,
      // so any format it supports works.
      const stream = createReadStream(next.path);
      const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });
      this.player.play(resource);
    } catch (error) {
      console.error(`Failed to play "${next.title}" in guild ${this.guildId}:`, error);
      this.current = undefined;
      void this.processQueue();
    }
  }

  private scheduleLeave(): void {
    if (this.leaveTimer) clearTimeout(this.leaveTimer);
    this.leaveTimer = setTimeout(() => this.destroy(), EMPTY_LEAVE_DELAY);
  }
}
