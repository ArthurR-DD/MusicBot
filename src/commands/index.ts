import type {
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

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const list: Command[] = [play, skip, stop, pause, resume, queue];

export const commands = new Map<string, Command>(
  list.map((command) => [command.data.name, command]),
);
