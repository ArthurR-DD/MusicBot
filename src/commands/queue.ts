import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getQueue } from '../music/manager';

const MAX_LISTED = 10;

export const data = new SlashCommandBuilder()
  .setName('queue')
  .setDescription('Show the current track and what is coming up');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const queue = interaction.guildId ? getQueue(interaction.guildId) : undefined;
  if (!queue || !queue.current) {
    await interaction.reply({
      content: 'The queue is empty.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lines: string[] = [`**Now playing:** ${queue.current.title}`];

  const pending = queue.pending;
  if (pending.length > 0) {
    lines.push('', '**Up next:**');
    pending.slice(0, MAX_LISTED).forEach((track, i) => {
      lines.push(`\`${i + 1}.\` ${track.title}`);
    });
    if (pending.length > MAX_LISTED) {
      lines.push(`…and ${pending.length - MAX_LISTED} more.`);
    }
  }

  await interaction.reply(lines.join('\n'));
}
