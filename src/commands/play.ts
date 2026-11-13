import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { recordPlay } from '../music/history';
import { findTrack, searchLibrary } from '../music/library';
import { ensureQueue } from '../music/manager';
import { isUrl, resolveRemoteTrack, searchYouTube } from '../music/remote';
import { formatSuggestion, withTimeout } from '../music/suggestions';
import { formatDuration, type RemoteTrack, type Track } from '../music/track';

/** Discord's red, to match the usual video-site look. */
const EMBED_COLOUR = 0xff0000;

/** Rich "now playing" card for a streamed link: thumbnail, length, source. */
function remoteEmbed(track: RemoteTrack, heading: string, position: number): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOUR)
    .setAuthor({ name: heading })
    .setTitle(track.title.slice(0, 256))
    .setURL(track.url)
    .addFields({ name: 'Length', value: formatDuration(track.duration), inline: true });

  if (position > 0) {
    embed.addFields({ name: 'Position', value: `#${position}`, inline: true });
  }
  if (track.uploader) {
    embed.addFields({ name: 'Channel', value: track.uploader.slice(0, 1024), inline: true });
  }
  if (track.thumbnail) {
    embed.setThumbnail(track.thumbnail);
  }

  return embed.setFooter({ text: `Requested by ${track.requestedBy}` });
}

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play a track from the library, or paste a link')
  .addStringOption((option) =>
    option
      .setName('query')
      .setDescription('Track name or YouTube title (start typing to see matches), or a link')
      .setRequired(true)
      .setAutocomplete(true),
  );

/** Don't hit YouTube for one or two letters; it's slow and the results are noise. */
const MIN_SEARCH_LENGTH = 3;
/** Wait for typing to pause before spawning a yt-dlp search. */
const DEBOUNCE_MS = 300;
/** Discord drops autocomplete answers after 3s; leave room for the debounce and reply. */
const SEARCH_TIMEOUT_MS = 2000;
/** Library matches shown above the YouTube ones when searching. */
const LIBRARY_SUGGESTIONS = 5;
const MAX_CHOICES = 25;

/** Latest autocomplete request per user, so superseded keystrokes skip the search. */
const latestRequest = new Map<string, number>();
let requestCounter = 0;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Suggest library tracks and YouTube videos as the user types. */
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();

  // A link is played directly, so there's nothing in the library to suggest.
  if (isUrl(focused)) {
    await interaction.respond([{ name: '🔗 Play from this link', value: focused.slice(0, 100) }]);
    return;
  }

  const libraryChoices = (limit: number) =>
    searchLibrary(focused, limit).then((matches) =>
      matches.map((entry) => ({
        // Discord caps both fields at 100 characters.
        name: entry.title.slice(0, 100),
        value: entry.path.slice(0, 100),
      })),
    );

  const query = focused.trim();
  if (query.length < MIN_SEARCH_LENGTH) {
    await interaction.respond(await libraryChoices(MAX_CHOICES));
    return;
  }

  const userId = interaction.user.id;
  const requestId = ++requestCounter;
  latestRequest.set(userId, requestId);

  const library = libraryChoices(LIBRARY_SUGGESTIONS);
  await sleep(DEBOUNCE_MS);

  let youtube: { name: string; value: string }[] = [];
  // If the user typed more while we waited, this answer is stale: skip yt-dlp.
  if (latestRequest.get(userId) === requestId) {
    let timedOut = true;
    const search = searchYouTube(query).then(
      (found) => {
        timedOut = false;
        return found;
      },
      (error) => {
        // Without this a yt-dlp failure just looks like "no suggestions".
        timedOut = false;
        console.error(
          `YouTube search failed for ${JSON.stringify(query)}:`,
          (error as { stderr?: string }).stderr?.trim() || error,
        );
        return [];
      },
    );
    const results = await withTimeout(search, SEARCH_TIMEOUT_MS, []);
    if (timedOut) {
      console.warn(`YouTube search for ${JSON.stringify(query)} took over ${SEARCH_TIMEOUT_MS}ms`);
    }
    youtube = results.map(formatSuggestion);
  }
  if (latestRequest.get(userId) === requestId) latestRequest.delete(userId);

  const choices = [...(await library), ...youtube];
  await interaction.respond(choices.slice(0, MAX_CHOICES));
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
      // Not in the library: treat the text as a YouTube title, so /play works
      // even when the user submitted without picking a suggestion.
      try {
        const [first] = await searchYouTube(query);
        if (first) track = await resolveRemoteTrack(first.url, member.user.username);
      } catch (error) {
        console.error(`YouTube search failed for ${JSON.stringify(query)}:`, error);
      }
      if (!track) {
        await interaction.editReply(
          `❌ No track matching **${query}** in the library or on YouTube.`,
        );
        return;
      }
    }
  }

  const queue = ensureQueue(channel);
  const position = queue.enqueue(track);
  const heading = position === 0 ? '▶️ Now playing' : '➕ Added to queue';

  if (track.source === 'remote') {
    // Feeds /radio. Only explicit link plays are counted — /radio's own
    // queueing must not, or it would inflate the ranking that chose it.
    recordPlay(channel.guild.id, track).catch((error) =>
      console.error('Could not record play:', error),
    );

    await interaction.editReply({ embeds: [remoteEmbed(track, heading, position)] });
    return;
  }

  await interaction.editReply(
    position === 0
      ? `▶️ Now playing: **${track.title}**`
      : `➕ Queued **${track.title}** — position ${position}.`,
  );
}
