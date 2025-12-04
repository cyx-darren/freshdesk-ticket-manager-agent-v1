import { logger } from '../utils/logger.js';
import * as ticketCommand from '../commands/ticket.js';
import * as helpCommand from '../commands/help.js';

const PREFIX = '!';

const commands = new Map([
  [ticketCommand.name, ticketCommand],
  [helpCommand.name, helpCommand],
]);

export async function handleMessage(message) {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check for prefix
  if (!message.content.startsWith(PREFIX)) return;

  // Parse command and arguments
  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const commandName = args.shift().toLowerCase();

  // Find and execute command
  const command = commands.get(commandName);

  if (!command) {
    return; // Silently ignore unknown commands
  }

  try {
    await command.execute(message, args);
  } catch (error) {
    logger.error(`Error executing command ${commandName}:`, error);
    await message.reply('An error occurred while executing this command.');
  }
}
