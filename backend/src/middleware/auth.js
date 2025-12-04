import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

export function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  // Skip auth in development if no API key is configured
  if (config.server.nodeEnv === 'development' && !config.api.key) {
    return next();
  }

  if (!apiKey) {
    logger.warn('API request without API key');
    return res.status(401).json({
      success: false,
      error: 'API key is required',
    });
  }

  if (apiKey !== config.api.key) {
    logger.warn('API request with invalid API key');
    return res.status(401).json({
      success: false,
      error: 'Invalid API key',
    });
  }

  next();
}
