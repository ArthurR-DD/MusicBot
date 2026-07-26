import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { findTrack, searchLibrary } from '../music/library';
import { ensureQueue } from '../music/manager';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play a track from the local music library')
  .addStringOption((option) =>
    option
      .setName('query')
      .setDescription('Track name (start typing to see matches)')
      .setRequired(true)
      .setAutocomplete(true),
  );

/** Suggest matching tracks as the user types. */
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  const matches = await searchLibrary(focused, 25);

  await interaction.respond(
    matches.map((entry) => ({
      // Discord caps both fields at 100 characters.
      name: entry.title.slice(0, 100),
      value: entry.path.slice(0, 100),
    })),
  );
}

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

  const track = await findTrack(query, member.user.username);
  if (!track) {
    await interaction.editReply(`❌ No track matching **${query}** in the library.`);
    return;
  }

  const queue = ensureQueue(channel);
  const position = queue.enqueue(track);

  await interaction.editReply(
    position === 0
      ? `▶️ Now playing: **${track.title}**`
      : `➕ Queued **${track.title}** — position ${position}.`,
  );
}
