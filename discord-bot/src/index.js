import { Client, GatewayIntentBits } from 'discord.js';
import { config } from './config/config.js';
import { logger } from './utils/logger.js';
import { handleMessage } from './handlers/messageHandler.js';

// Validate required configuration
if (!config.discord.token) {
  logger.error('DISCORD_BOT_TOKEN is required');
  process.exit(1);
}

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Ready event
client.once('ready', () => {
  logger.info(`Discord bot logged in as ${client.user.tag}`);
  logger.info(`Connected to ${client.guilds.cache.size} guild(s)`);
});

// Message event
client.on('messageCreate', async (message) => {
  try {
    await handleMessage(message);
  } catch (error) {
    logger.error('Error handling message:', error);
  }
});

// Error handling
client.on('error', (error) => {
  logger.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
});

// Login
client.login(config.discord.token);
