import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import * as play from './play';
import * as skip from './skip';
import * as stop from './stop';
import * as pause from './pause';
import * as resume from './resume';
import * as queue from './queue';
import * as upload from './upload';

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** Optional handler for options declared with setAutocomplete(true). */
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

const list: Command[] = [play, skip, stop, pause, resume, queue, upload];

export const commands = new Map<string, Command>(
  list.map((command) => [command.data.name, command]),
);
