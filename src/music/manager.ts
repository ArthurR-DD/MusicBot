import type { VoiceBasedChannel } from 'discord.js';
import { GuildQueue } from './guildQueue';

const queues = new Map<string, GuildQueue>();

export function getQueue(guildId: string): GuildQueue | undefined {
  return queues.get(guildId);
}

/** Get the guild's queue, creating (and joining the voice channel) if needed. */
export function ensureQueue(channel: VoiceBasedChannel): GuildQueue {
  const existing = queues.get(channel.guild.id);
  if (existing) return existing;

  const queue = new GuildQueue(channel, (id) => queues.delete(id));
  queues.set(channel.guild.id, queue);
  return queue;
}
