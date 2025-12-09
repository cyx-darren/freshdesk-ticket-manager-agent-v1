import 'dotenv/config';

export const config = {
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  api: {
    key: process.env.API_KEY,
  },
  freshdesk: {
    domain: process.env.FRESHDESK_DOMAIN,
    apiKey: process.env.FRESHDESK_API_KEY,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  kbAgent: {
    url: process.env.KB_AGENT_URL,
    apiKey: process.env.KB_AGENT_API_KEY,
  },
  priceAgent: {
    url: process.env.PRICE_AGENT_URL || 'https://backend-production-b948.up.railway.app',
    apiKey: process.env.PRICE_AGENT_API_KEY,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
