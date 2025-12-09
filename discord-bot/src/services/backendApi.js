import axios from 'axios';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

const api = axios.create({
  baseURL: config.backend.url,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': config.backend.apiKey,
  },
});

export async function analyzeTicket(ticketId, discordUserId, discordChannelId) {
  try {
    logger.info(`Requesting ticket analysis for ticket #${ticketId}`);

    const response = await api.post('/api/ticket/analyze', {
      ticketId,
      discordUserId,
      discordChannelId,
      options: {
        includeKB: true,
        includePrice: true,
        includeArtwork: false,
      },
    });

    return response.data;
  } catch (error) {
    logger.error('Failed to analyze ticket:', error.message);
    throw error;
  }
}

export async function healthCheck() {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    logger.error('Health check failed:', error.message);
    throw error;
  }
}
