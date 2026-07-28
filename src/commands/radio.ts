import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { config } from '../config';
import { topTracks } from '../music/history';
import { ensureQueue } from '../music/manager';
import { formatDuration } from '../music/track';

const EMBED_COLOUR = 0x1db954;

/**
 * Return a shuffled copy, leaving the input untouched (Fisher-Yates).
 * Exported so the shuffle can be exercised directly.
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export const data = new SlashCommandBuilder()
  .setName('radio')
  .setDescription("Shuffle-play the server's most played links from the last few days");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember;
  const channel = member.voice?.channel;
  if (!channel) {
    await interaction.reply({
      content: '🔇 You need to be in a voice channel first.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  const ranked = await topTracks(channel.guild.id, config.radioSize);
  if (ranked.length === 0) {
    await interaction.editReply(
      `📻 Nothing to play yet — no links have been played in the last ${config.historyWindowDays} days. ` +
        'Play a few with `/play <link>` and they will feed the radio.',
    );
    return;
  }

  const queue = ensureQueue(channel);
  // Queueing here deliberately does not feed the history: /radio replays would
  // otherwise inflate the very ranking that chose them.
  const order = shuffle(ranked);
  for (const { track } of order) {
    queue.enqueue({ ...track, requestedBy: member.user.username });
  }

  const listed = order
    .slice(0, 10)
    .map(
      ({ track, plays }, i) =>
        `\`${i + 1}.\` ${track.title} \`[${formatDuration(track.duration)}]\` · ${plays}×`,
    );
  if (order.length > listed.length) {
    listed.push(`…and ${order.length - listed.length} more.`);
  }

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOUR)
    .setAuthor({ name: '📻 Radio' })
    .setTitle(`${order.length} track(s), shuffled`)
    .setDescription(listed.join('\n').slice(0, 4096))
    .setFooter({
      text: `Most played over the last ${config.historyWindowDays} days · started by ${member.user.username}`,
    });

  const top = order[0]?.track;
  if (top?.thumbnail) embed.setThumbnail(top.thumbnail);

  await interaction.editReply({ embeds: [embed] });
}
