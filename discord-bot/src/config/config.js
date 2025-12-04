import 'dotenv/config';

export const config = {
  discord: {
    token: process.env.DISCORD_BOT_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
  },
  backend: {
    url: process.env.BACKEND_URL || 'http://localhost:3000',
    apiKey: process.env.BACKEND_API_KEY,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  nodeEnv: process.env.NODE_ENV || 'development',
};
