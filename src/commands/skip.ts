import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { getQueue } from '../music/manager';

export const data = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('Skip the current track');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const queue = interaction.guildId ? getQueue(interaction.guildId) : undefined;
  if (!queue || !queue.current) {
    await interaction.reply({
      content: 'Nothing is playing.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const skipped = queue.current.title;
  queue.skip();
  await interaction.reply(`⏭️ Skipped **${skipped}**.`);
}
