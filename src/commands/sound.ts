import {
  type DiscordGatewayAdapterCreator,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
} from '@discordjs/voice';
import {
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  ChannelType,
  type GuildSoundboardSound,
  MessageFlags,
  SlashCommandBuilder,
  type StringSelectMenuInteraction,
  StringSelectMenuBuilder,
  type VoiceChannel,
} from 'discord.js';
import { getQueue } from '../music/manager';
import { describeSoundError } from './soundErrors';

/** Discord caps a select menu at 25 options. */
const MAX_OPTIONS = 25;
/** How long to stay connected after firing a sound, when we joined just for it. */
const LEAVE_DELAY_MS = 5_000;

export const data = new SlashCommandBuilder()
  .setName('sound')
  .setDescription('Joue un son du serveur dans le salon vocal de quelqu’un')
  .addUserOption((option) =>
    option.setName('cible').setDescription('La personne à viser').setRequired(true),
  );

/** customId carries the target so the select handler knows where to play. */
const CUSTOM_ID_PREFIX = 'sound:';

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const target = interaction.options.getUser('cible', true);
  const member = await guild.members.fetch(target.id).catch(() => null);
  const channel = member?.voice.channel;

  if (!channel) {
    await interaction.reply({
      content: `🔇 <@${target.id}> n’est dans aucun salon vocal.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sounds = await guild.soundboardSounds.fetch().catch(() => null);
  if (!sounds || sounds.size === 0) {
    await interaction.reply({
      content: 'Ce serveur n’a aucun son de soundboard.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const available = [...sounds.values()].filter((sound) => sound.available);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${CUSTOM_ID_PREFIX}${target.id}`)
    .setPlaceholder('Choisis un son')
    .addOptions(
      available.slice(0, MAX_OPTIONS).map((sound) => ({
        label: sound.name.slice(0, 100),
        value: sound.soundId,
        ...(sound.emoji ? { emoji: sound.emoji.id ?? sound.emoji.name ?? undefined } : {}),
      })),
    );

  const truncated =
    available.length > MAX_OPTIONS
      ? `\n_(${available.length - MAX_OPTIONS} son(s) de plus non listés — Discord limite à ${MAX_OPTIONS}.)_`
      : '';

  await interaction.reply({
    content: `🎯 Cible : <@${target.id}> dans **${channel.name}**.${truncated}`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    flags: MessageFlags.Ephemeral,
  });
}

/** True when this select menu belongs to /sound. */
export function ownsComponent(customId: string): boolean {
  return customId.startsWith(CUSTOM_ID_PREFIX);
}

export async function handleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const targetId = interaction.customId.slice(CUSTOM_ID_PREFIX.length);
  const soundId = interaction.values[0];
  if (!soundId) return;

  const member = await guild.members.fetch(targetId).catch(() => null);
  const channel = member?.voice.channel;
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    await interaction.update({
      content: `🔇 <@${targetId}> n’est plus dans un salon vocal.`,
      components: [],
    });
    return;
  }

  const sound = guild.soundboardSounds.cache.get(soundId);
  if (!sound) {
    await interaction.update({ content: 'Ce son n’existe plus.', components: [] });
    return;
  }

  await interaction.deferUpdate();

  try {
    const joined = await ensureConnected(channel);
    if (joined === 'busy') {
      await interaction.editReply({
        content:
          '⏳ Le bot joue de la musique dans un autre salon. ' +
          'Utilise `/stop` d’abord, ou vise quelqu’un dans ce salon-là.',
        components: [],
      });
      return;
    }

    // Soundboard sounds are mixed by Discord's clients, not by our audio
    // player, so this plays over whatever is in the queue without disturbing it.
    await channel.sendSoundboardSound(sound as GuildSoundboardSound);

    await interaction.editReply({
      content: `🔊 **${sound.name}** envoyé sur <@${targetId}> dans **${channel.name}**.`,
      components: [],
    });

    if (joined === 'joined-for-this') scheduleLeave(guild.id, channel.id);
  } catch (error) {
    console.error('Could not send the soundboard sound:', error);
    await interaction.editReply({ content: describeSoundError(error), components: [] });
  }
}

type ConnectOutcome = 'already-there' | 'joined-for-this' | 'busy';

/**
 * Make sure the bot's voice state is in `channel`, which is what the soundboard
 * endpoint requires. A bot gets one voice connection per guild, so moving it
 * while music is playing elsewhere would cut the music — refuse instead.
 */
async function ensureConnected(channel: VoiceChannel): Promise<ConnectOutcome> {
  const existing = getVoiceConnection(channel.guild.id);

  if (existing?.joinConfig.channelId === channel.id) {
    // Discord won't fire a soundboard sound for a deafened member, and
    // joinVoiceChannel deafens by default — so the music connection we're
    // reusing is deafened. rejoin() updates the voice state in place, without
    // dropping the connection or interrupting playback.
    if (existing.joinConfig.selfDeaf) {
      existing.rejoin({ ...existing.joinConfig, selfDeaf: false });
    }
    return 'already-there';
  }

  if (existing && getQueue(channel.guild.id)?.current) return 'busy';

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
    // Must not be deafened for the soundboard endpoint to accept the request.
    selfDeaf: false,
  });
  await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  return 'joined-for-this';
}

/** Leave shortly after, but only if nothing started playing in the meantime. */
function scheduleLeave(guildId: string, channelId: string): void {
  setTimeout(() => {
    const connection = getVoiceConnection(guildId);
    if (!connection || connection.joinConfig.channelId !== channelId) return;
    if (getQueue(guildId)?.current) return;
    connection.destroy();
  }, LEAVE_DELAY_MS);
}
