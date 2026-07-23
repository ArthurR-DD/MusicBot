import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getQueue } from '../music/manager';

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Stop playback, clear the queue, and leave the voice channel');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const queue = interaction.guildId ? getQueue(interaction.guildId) : undefined;
  if (!queue) {
    await interaction.reply({
      content: 'Nothing is playing.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  queue.stop();
  await interaction.reply('⏹️ Stopped playback and left the channel.');
}
