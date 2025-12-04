import { Router } from 'express';
import axios from 'axios';
import { config } from '../config/config.js';

const router = Router();

/**
 * GET /health
 * Health check endpoint
 */
router.get('/', async (req, res) => {
  const health = {
    status: 'healthy',
    service: 'ai-ticket-manager-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    dependencies: {
      freshdesk: 'unknown',
      claude: 'unknown',
      kbAgent: 'unknown',
    },
  };

  // Check Freshdesk connectivity
  try {
    await axios.get(`https://${config.freshdesk.domain}/api/v2/tickets?per_page=1`, {
      auth: { username: config.freshdesk.apiKey, password: 'X' },
      timeout: 5000,
    });
    health.dependencies.freshdesk = 'connected';
  } catch {
    health.dependencies.freshdesk = 'disconnected';
  }

  // Check Claude API (just verify key exists)
  health.dependencies.claude = config.anthropic.apiKey ? 'configured' : 'not configured';

  // Check KB Agent connectivity
  try {
    await axios.get(`${config.kbAgent.url}/health`, { timeout: 5000 });
    health.dependencies.kbAgent = 'connected';
  } catch {
    health.dependencies.kbAgent = 'disconnected';
  }

  // Determine overall health
  const allHealthy = Object.values(health.dependencies).every(
    status => status === 'connected' || status === 'configured'
  );

  if (!allHealthy) {
    health.status = 'degraded';
  }

  res.status(allHealthy ? 200 : 503).json(health);
});

export default router;
