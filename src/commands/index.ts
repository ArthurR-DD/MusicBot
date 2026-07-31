import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import * as prout from './prout';
import * as ping from './ping';
import * as play from './play';
import * as skip from './skip';
import * as sound from './sound';
import * as stop from './stop';
import * as pause from './pause';
import * as resume from './resume';
import * as queue from './queue';
import * as radio from './radio';

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** Optional handler for options declared with setAutocomplete(true). */
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
  /** True when a select-menu customId belongs to this command. */
  ownsComponent?: (customId: string) => boolean;
  /** Handler for that command's select menus. */
  handleSelect?: (interaction: StringSelectMenuInteraction) => Promise<void>;
}

const list: Command[] = [play, skip, stop, pause, resume, queue, ping, radio, prout, sound];

export const commands = new Map<string, Command>(
  list.map((command) => [command.data.name, command]),
);
