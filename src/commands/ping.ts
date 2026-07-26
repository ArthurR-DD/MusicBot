import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

/** Fixed reply, kept here so the test can assert on the same value. */
export const PONG = 'ton caleçon';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check that the bot is alive');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply(PONG);
}
