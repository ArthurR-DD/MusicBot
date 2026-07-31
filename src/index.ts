import {
  type ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from 'discord.js';
import { commands } from './commands';
import { config } from './config';
import { isMarked } from './marks';
import { proutPayload } from './prout';
import { registerCommands } from './registerCommands';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, async (ready) => {
  console.log(`Logged in as ${ready.user.tag}`);
  // Register slash commands on startup so a deploy is all that's needed to keep
  // them up to date. A failure here shouldn't take the bot down.
  try {
    await registerCommands();
  } catch (error) {
    console.error('Failed to register commands on startup:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);
    try {
      await command?.autocomplete?.(interaction);
    } catch (error) {
      console.error(`Autocomplete failed for /${interaction.commandName}:`, error);
    }
    return;
  }

  // Select menus are routed to whichever command claims their customId.
  if (interaction.isStringSelectMenu()) {
    const owner = [...commands.values()].find((c) => c.ownsComponent?.(interaction.customId));
    try {
      await owner?.handleSelect?.(interaction);
    } catch (error) {
      console.error(`Select menu failed for ${interaction.customId}:`, error);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await command.execute(interaction);
    await sendProut(interaction);
  } catch (error) {
    console.error(`Error handling /${interaction.commandName}:`, error);
    const message = { content: '❌ Something went wrong.', flags: MessageFlags.Ephemeral } as const;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: message.content }).catch(() => undefined);
    } else {
      await interaction.reply(message).catch(() => undefined);
    }
  }
});

/**
 * Follow a marked user's command with the configured GIF. Best-effort: a
 * failure here must never surface as a command error, since the command itself
 * already succeeded.
 */
async function sendProut(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    if (!interaction.guildId) return;
    if (!(await isMarked(interaction.guildId, interaction.user.id))) return;
    await interaction.followUp({ content: proutPayload() });
  } catch (error) {
    console.error('Could not send the prout:', error);
  }
}

void client.login(config.token);
