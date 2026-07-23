import { REST, Routes } from 'discord.js';
import { commands } from './commands';
import { config } from './config';

const body = [...commands.values()].map((command) => command.data.toJSON());

const rest = new REST().setToken(config.token);

async function main(): Promise<void> {
  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    console.log(`Registered ${body.length} guild command(s) to ${config.guildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log(`Registered ${body.length} global command(s). Propagation may take up to ~1 hour.`);
  }
}

main().catch((error) => {
  console.error('Failed to register commands:', error);
  process.exit(1);
});
