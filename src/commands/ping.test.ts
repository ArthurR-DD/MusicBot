import assert from 'node:assert/strict';
import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, test } from 'node:test';
import { commands } from './index';
import { PONG, data, execute } from './ping';

describe('/ping', () => {
  test('replies with the fixed message', async () => {
    const replies: unknown[] = [];
    const interaction = {
      reply: async (payload: unknown) => {
        replies.push(payload);
      },
    } as unknown as ChatInputCommandInteraction;

    await execute(interaction);

    assert.deepEqual(replies, [PONG]);
  });

  test('is registered, so it gets deployed to Discord', () => {
    // The registry drives command registration on startup; a command that
    // isn't in it silently never appears in Discord.
    assert.equal(commands.get('ping')?.data.name, data.name);
  });
});
