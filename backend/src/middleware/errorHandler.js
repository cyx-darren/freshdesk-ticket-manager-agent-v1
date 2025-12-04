import { logger } from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
  logger.error('Unhandled error:', err);

  // Handle Axios errors (from Freshdesk/KB Agent calls)
  if (err.response) {
    const status = err.response.status;

    if (status === 404) {
      return res.status(404).json({
        success: false,
        error: 'Resource not found',
        details: err.response.data?.message || 'The requested resource was not found',
      });
    }

    if (status === 401 || status === 403) {
      return res.status(status).json({
        success: false,
        error: 'Authentication failed',
        details: 'Invalid API credentials',
      });
    }

    return res.status(status).json({
      success: false,
      error: 'External service error',
      details: err.response.data?.message || err.message,
    });
  }

  // Handle network errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    return res.status(503).json({
      success: false,
      error: 'Service unavailable',
      details: 'Could not connect to external service',
    });
  }

  // Handle timeout errors
  if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
    return res.status(504).json({
      success: false,
      error: 'Request timeout',
      details: 'The request took too long to complete',
    });
  }

  // Default error response
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: err.message,
  });
}
