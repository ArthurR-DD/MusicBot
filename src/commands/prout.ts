import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { listMarked, toggleMark } from '../marks';

export const data = new SlashCommandBuilder()
  .setName('prout')
  .setDescription('Marque quelqu’un : ses commandes déclencheront un prout')
  .addUserOption((option) =>
    option
      .setName('cible')
      .setDescription('La personne à marquer (relancer la commande la démarque)')
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const target = interaction.options.getUser('cible');

  // No target: report who is currently marked.
  if (!target) {
    const marked = await listMarked(guildId);
    await interaction.reply({
      content: marked.length
        ? `Marqué(s) : ${marked.map((id) => `<@${id}>`).join(', ')}`
        : 'Personne n’est marqué.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (target.bot) {
    await interaction.reply({
      content: 'Les bots ne peuvent pas être marqués.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const marked = await toggleMark(guildId, target.id);
  await interaction.reply(
    marked
      ? `💨 <@${target.id}> est marqué.`
      : `<@${target.id}> n’est plus marqué.`,
  );
}
