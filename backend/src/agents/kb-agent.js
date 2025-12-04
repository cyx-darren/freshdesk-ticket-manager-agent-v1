import axios from 'axios';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

const kbApi = axios.create({
  baseURL: config.kbAgent.url,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
    'x-bot-api-key': config.kbAgent.apiKey,
  },
});

/**
 * Query the Knowledge Base agent for relevant information
 */
export async function queryKnowledgeBase(query, context = {}) {
  try {
    logger.info(`Querying KB Agent: "${query.substring(0, 100)}..."`);

    const sessionId = `ticket-mgr-${context.ticketId || 'unknown'}-${Date.now()}`;

    const response = await kbApi.post('/api/bot/chat', {
      message: query,
      discordUserId: 'ticket-manager-orchestrator',
      discordChannelId: 'internal-agent-call',
      sessionId,
    });

    const data = response.data;

    logger.info(`KB Agent returned ${data.articlesFound || 0} articles`);

    return {
      success: true,
      answer: data.response,
      sources: data.sources || [],
      searchTerms: data.searchTerms,
      articlesFound: data.articlesFound || 0,
      confidence: calculateConfidence(data),
    };
  } catch (error) {
    logger.error('KB Agent query failed:', error.message);

    return {
      success: false,
      error: error.message,
      answer: null,
      sources: [],
      confidence: 0,
    };
  }
}

/**
 * Build a query string from ticket analysis
 */
export function buildKBQuery(analysis, ticketSubject) {
  const { latestCustomerMessage, extractedEntities } = analysis;

  // Combine the latest message with extracted product info
  let query = latestCustomerMessage || ticketSubject;

  // Add product context if available
  if (extractedEntities?.products?.length > 0) {
    query = `${extractedEntities.products.join(', ')}: ${query}`;
  }

  return query;
}

/**
 * Calculate confidence based on KB response
 */
function calculateConfidence(data) {
  if (!data.response || data.response.length < 50) {
    return 0.3;
  }

  if (data.articlesFound >= 3) {
    return 0.95;
  }

  if (data.articlesFound >= 1) {
    return 0.8;
  }

  return 0.5;
}
