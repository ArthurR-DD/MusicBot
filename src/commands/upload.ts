import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { config } from '../config';
import { safeName, uniquePath } from '../music/filenames';
import { AUDIO_EXTENSIONS, invalidateLibrary } from '../music/library';
import { EXTRACTED_EXTENSION, VIDEO_EXTENSIONS, extractAudio } from '../music/transcode';

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

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const attachment = interaction.options.getAttachment('file', true);

  const ext = extname(attachment.name).toLowerCase();
  // Video is accepted too — the audio track is extracted and the video dropped.
  // Check video first so ambiguous containers like .webm take that path.
  const isVideo = VIDEO_EXTENSIONS.has(ext);
  if (!isVideo && !AUDIO_EXTENSIONS.has(ext)) {
    await interaction.reply({
      content:
        `❌ **${attachment.name}** isn't a supported audio or video file.\n` +
        `Audio: ${[...AUDIO_EXTENSIONS].join(', ')}\n` +
        `Video: ${[...VIDEO_EXTENSIONS].join(', ')}`,
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

  // Video is downloaded to a scratch file first so ffmpeg can seek in it
  // (formats like .mp4 may keep their index at the end of the file).
  let scratch: string | undefined;

  try {
    await mkdir(config.musicDir, { recursive: true });
    const outExt = isVideo ? EXTRACTED_EXTENSION : ext;
    const target = await uniquePath(config.musicDir, stem, outExt);

    if (isVideo) {
      await interaction.editReply(`⏳ Extracting audio from **${attachment.name}**…`);
      scratch = join(tmpdir(), `upload-${randomUUID()}${ext}`);
    }

    const response = await fetch(attachment.url);
    if (!response.ok || !response.body) {
      throw new Error(`Discord returned ${response.status} for the attachment.`);
    }

    await pipeline(Readable.fromWeb(response.body), createWriteStream(scratch ?? target));

    if (scratch) {
      await extractAudio(scratch, target);
    }

    invalidateLibrary();
    await interaction.editReply(
      isVideo
        ? `✅ Extracted audio from **${attachment.name}** and added **${basename(target, outExt)}** to the library. Play it with \`/play\`.`
        : `✅ Added **${basename(target, outExt)}** to the library. Play it with \`/play\`.`,
    );
  } catch (error) {
    console.error('Upload failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    let hint = '';
    if (/EACCES|EPERM|EROFS/.test(message)) {
      hint = ' The library folder is not writable by the bot — see "Uploads" in the README.';
    } else if (/timed out/i.test(message)) {
      hint = ' The file took too long to process — try a shorter one.';
    } else if (isVideo) {
      hint = " The video's audio could not be extracted.";
    }
    await interaction.editReply(`❌ Could not save that file.${hint}`);
  } finally {
    if (scratch) await rm(scratch, { force: true }).catch(() => undefined);
  }
}
