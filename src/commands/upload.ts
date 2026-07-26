import { createWriteStream } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { config } from '../config';
import { AUDIO_EXTENSIONS, invalidateLibrary } from '../music/library';

export const data = new SlashCommandBuilder()
  .setName('upload')
  .setDescription('Add an audio file to the music library')
  .addAttachmentOption((option) =>
    option.setName('file').setDescription('The audio file to add').setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName('name')
      .setDescription('Optional name to save it as (defaults to the file name)')
      .setRequired(false),
  );

/** Characters that are unsafe or awkward in a file name. */
const UNSAFE_CHARS = new Set(['/', '\\', ':', '*', '?', '"', '<', '>', '|']);

/**
 * Reduce an arbitrary user-supplied name to a safe bare file name. Strips any
 * directory components, control characters and path-significant characters, so
 * an upload can never be written outside the library directory.
 */
function safeName(raw: string): string {
  // basename() drops any directory part, including "../" traversal attempts.
  const bare = basename(raw);

  const filtered = [...bare]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 32 || code === 127) return false; // control characters
      return !UNSAFE_CHARS.has(ch);
    })
    .join('');

  return filtered
    .replace(/\s+/g, ' ')
    .trim()
    // Reject leading dots so uploads can't create hidden files or "..".
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
}

/** Find a free path, appending " (2)", " (3)", … if the name is taken. */
async function uniquePath(dir: string, stem: string, ext: string): Promise<string> {
  for (let i = 1; i < 100; i += 1) {
    const candidate = join(dir, i === 1 ? `${stem}${ext}` : `${stem} (${i})${ext}`);
    try {
      await access(candidate);
    } catch {
      return candidate; // does not exist — free to use
    }
  }
  throw new Error('Too many files with that name.');
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const attachment = interaction.options.getAttachment('file', true);

  const ext = extname(attachment.name).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(ext)) {
    await interaction.reply({
      content:
        `❌ **${attachment.name}** isn't a supported audio file.\n` +
        `Supported: ${[...AUDIO_EXTENSIONS].join(', ')}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const maxBytes = config.maxUploadMb * 1024 * 1024;
  if (attachment.size > maxBytes) {
    const mb = (attachment.size / 1024 / 1024).toFixed(1);
    await interaction.reply({
      content: `❌ That file is ${mb} MB — the limit is ${config.maxUploadMb} MB.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Save under the `name` option if given, otherwise the uploaded file's name.
  const requested = interaction.options.getString('name');
  const stem = safeName(requested ?? basename(attachment.name, ext));
  if (!stem) {
    await interaction.reply({
      content: "❌ That name can't be used as a file name. Try a different one.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  try {
    await mkdir(config.musicDir, { recursive: true });
    const target = await uniquePath(config.musicDir, stem, ext);

    const response = await fetch(attachment.url);
    if (!response.ok || !response.body) {
      throw new Error(`Discord returned ${response.status} for the attachment.`);
    }

    await pipeline(Readable.fromWeb(response.body), createWriteStream(target));

    invalidateLibrary();
    await interaction.editReply(
      `✅ Added **${basename(target, ext)}** to the library. Play it with \`/play\`.`,
    );
  } catch (error) {
    console.error('Upload failed:', error);
    const writeDenied = error instanceof Error && /EACCES|EPERM|EROFS/.test(error.message);
    const hint = writeDenied
      ? ' The library folder is not writable by the bot — see "Uploads" in the README.'
      : '';
    await interaction.editReply(`❌ Could not save that file.${hint}`);
  }
}
