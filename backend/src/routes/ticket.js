import { Router } from 'express';
import { analyzeTicket } from '../services/orchestrator.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * POST /api/ticket/analyze
 * Analyze a Freshdesk ticket and coordinate agent responses
 */
router.post('/analyze', async (req, res, next) => {
  try {
    const { ticketId, discordUserId, discordChannelId, options = {} } = req.body;

    // Validate required fields
    if (!ticketId) {
      return res.status(400).json({
        success: false,
        error: 'ticketId is required',
      });
    }

    logger.info(`Received ticket analysis request for #${ticketId} from user ${discordUserId}`);

    const result = await analyzeTicket(ticketId, options);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
