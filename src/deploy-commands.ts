import { registerCommands } from './registerCommands';

// Standalone entry point for registering slash commands as a one-off
// (`pnpm run deploy`). The bot also registers on startup (see src/index.ts),
// so running this is optional.
registerCommands().catch((error) => {
  console.error('Failed to register commands:', error);
  process.exit(1);
});
