import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { resolveTrack } from '../music/extractor';
import { ensureQueue } from '../music/manager';
import { formatDuration } from '../music/track';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play audio from a YouTube URL or search query')
  .addStringOption((option) =>
    option
      .setName('query')
      .setDescription('A YouTube URL or search terms')
      .setRequired(true),
  );

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
  const query = interaction.options.getString('query', true);

  let track;
  try {
    track = await resolveTrack(query, member.user.username);
  } catch (error) {
    console.error('resolveTrack failed:', error);
    await interaction.editReply('❌ Could not find or load that track.');
    return;
  }

  const queue = ensureQueue(channel);
  const position = queue.enqueue(track);

  if (position === 0) {
    await interaction.editReply(
      `▶️ Now playing: **${track.title}** \`[${formatDuration(track.duration)}]\``,
    );
  } else {
    await interaction.editReply(
      `➕ Queued **${track.title}** \`[${formatDuration(track.duration)}]\` — position ${position}.`,
    );
  }
}
