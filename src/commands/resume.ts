import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getQueue } from '../music/manager';

export const data = new SlashCommandBuilder()
  .setName('resume')
  .setDescription('Resume the paused track');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const queue = interaction.guildId ? getQueue(interaction.guildId) : undefined;
  if (!queue || !queue.current) {
    await interaction.reply({
      content: 'Nothing is playing.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const resumed = queue.resume();
  await interaction.reply(resumed ? '▶️ Resumed.' : 'Already playing.');
}
