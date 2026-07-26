import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { findTrack, searchLibrary } from '../music/library';
import { ensureQueue } from '../music/manager';
import { isUrl, resolveRemoteTrack } from '../music/remote';
import { formatDuration, type Track } from '../music/track';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play a track from the library, or paste a link')
  .addStringOption((option) =>
    option
      .setName('query')
      .setDescription('Track name (start typing to see matches), or a link')
      .setRequired(true)
      .setAutocomplete(true),
  );

/** Suggest matching tracks as the user types. */
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();

  // A link is played directly, so there's nothing in the library to suggest.
  if (isUrl(focused)) {
    await interaction.respond([{ name: '🔗 Play from this link', value: focused.slice(0, 100) }]);
    return;
  }

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
  const query = interaction.options.getString('query', true).trim();

  let track: Track | undefined;
  if (isUrl(query)) {
    // Links are streamed straight through yt-dlp.
    try {
      track = await resolveRemoteTrack(query, member.user.username);
    } catch (error) {
      console.error('Link lookup failed:', error);
      await interaction.editReply("❌ Couldn't read that link. It may be unsupported or private.");
      return;
    }
  } else {
    track = await findTrack(query, member.user.username);
    if (!track) {
      await interaction.editReply(`❌ No track matching **${query}** in the library.`);
      return;
    }
  }

  const queue = ensureQueue(channel);
  const position = queue.enqueue(track);
  const label =
    track.source === 'remote'
      ? `**${track.title}** \`[${formatDuration(track.duration)}]\``
      : `**${track.title}**`;

  await interaction.editReply(
    position === 0 ? `▶️ Now playing: ${label}` : `➕ Queued ${label} — position ${position}.`,
  );
}
