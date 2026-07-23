import { REST, Routes } from 'discord.js';
import { commands } from './commands';
import { config } from './config';

/**
 * Register all slash commands with Discord. If GUILD_ID is set the commands are
 * registered to that single guild (instant); otherwise they are registered
 * globally (propagation can take up to ~1 hour). The PUT is idempotent, so this
 * is safe to run on every startup.
 */
export async function registerCommands(): Promise<void> {
  const body = [...commands.values()].map((command) => command.data.toJSON());
  const rest = new REST().setToken(config.token);

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    console.log(`Registered ${body.length} guild command(s) to ${config.guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log(`Registered ${body.length} global command(s). Propagation may take up to ~1 hour.`);
  }
}
