import { getFullTicketData } from './freshdesk.js';
import { classifyTicket } from './classifier.js';
import { synthesizeResponse } from './synthesizer.js';
import { queryKnowledgeBase, buildKBQuery } from '../agents/kb-agent.js';
import { queryPriceAgent, buildPriceQuery } from '../agents/price-agent.js';
import { queryProductAgent, buildProductQuery, extractProductContext } from '../agents/product-agent.js';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

/**
 * Orchestrate the full ticket analysis flow
 */
export async function analyzeTicket(ticketId, options = {}) {
  const startTime = Date.now();

  logger.info(`Starting ticket analysis for #${ticketId}`);

  // Step 1: Fetch ticket data from Freshdesk
  const ticketData = await getFullTicketData(ticketId);

  logger.info(`Fetched ticket #${ticketId}: "${ticketData.ticket.subject}" with ${ticketData.emailCount} messages`);

  // Step 2: Classify intent and summarize with Claude
  const analysis = await classifyTicket(ticketData);

  // Step 3: Call relevant agents based on intent
  const agentResponses = await callAgents(analysis, ticketData, options);

  // Step 4: Synthesize a suggested response (sales team member style)
  let synthesizedResponse = null;
  if (options.includeSynthesis !== false) {
    synthesizedResponse = await synthesizeResponse(ticketData, analysis, agentResponses);
  }

  // Step 5: Build response
  const processingTime = Date.now() - startTime;

  const result = {
    success: true,
    ticket: {
      id: ticketData.ticket.id,
      subject: ticketData.ticket.subject,
      status: ticketData.ticket.status,
      priority: ticketData.ticket.priority,
      customer: ticketData.customer,
      createdAt: ticketData.ticket.createdAt,
      updatedAt: ticketData.ticket.updatedAt,
    },
    analysis: {
      threadSummary: analysis.threadSummary,
      emailCount: ticketData.emailCount,
      latestCustomerMessage: analysis.latestCustomerMessage,
      intents: analysis.intents,
      extractedEntities: analysis.extractedEntities,
      confidence: analysis.confidence,
    },
    agentResponses,
    synthesizedResponse,
    freshdeskUrl: `https://${config.freshdesk.domain}/a/tickets/${ticketId}`,
    processingTime,
    timestamp: new Date().toISOString(),
  };

  logger.info(`Ticket #${ticketId} analysis completed in ${processingTime}ms`);

  return result;
}

/**
 * Call relevant agents based on detected intents
 */
async function callAgents(analysis, ticketData, options) {
  const { intents } = analysis;
  const responses = {
    knowledge: null,
    product: null,
    price: null,
    artwork: null,
  };

  const agentPromises = [];

  // Knowledge Base Agent
  if (options.includeKB !== false && (intents.includes('KNOWLEDGE') || intents.includes('OTHER'))) {
    const kbPromise = callKBAgent(analysis, ticketData)
      .then(result => { responses.knowledge = result; })
      .catch(error => {
        logger.error('KB Agent failed:', error);
        responses.knowledge = { success: false, error: error.message };
      });
    agentPromises.push(kbPromise);
  }

  // Product Agent
  if (options.includeProduct !== false && intents.includes('AVAILABILITY')) {
    const productPromise = callProductAgent(analysis, ticketData)
      .then(result => { responses.product = result; })
      .catch(error => {
        logger.error('Product Agent failed:', error);
        responses.product = { success: false, error: error.message };
      });
    agentPromises.push(productPromise);
  }

  // Price Agent
  if (options.includePrice !== false && intents.includes('PRICE')) {
    const pricePromise = callPriceAgent(analysis, ticketData)
      .then(result => { responses.price = result; })
      .catch(error => {
        logger.error('Price Agent failed:', error);
        responses.price = { success: false, error: error.message };
      });
    agentPromises.push(pricePromise);
  }

  // Artwork Agent (Phase 2 - placeholder)
  if (options.includeArtwork && intents.includes('ARTWORK')) {
    responses.artwork = {
      success: false,
      message: 'Artwork Agent not yet implemented (Phase 2)',
    };
  }

  // Wait for all agents to complete
  await Promise.all(agentPromises);

  return responses;
}

/**
 * Call the Knowledge Base agent
 */
async function callKBAgent(analysis, ticketData) {
  const query = buildKBQuery(analysis, ticketData.ticket.subject);

  const result = await queryKnowledgeBase(query, {
    ticketId: ticketData.ticket.id,
    customerEmail: ticketData.customer.email,
  });

  return result;
}

/**
 * Call the Price Agent
 */
async function callPriceAgent(analysis, ticketData) {
  const query = buildPriceQuery(analysis, ticketData.ticket.subject);

  const result = await queryPriceAgent(query, {
    ticketId: ticketData.ticket.id,
    customerEmail: ticketData.customer.email,
  });

  return result;
}

/**
 * Call the Product Agent
 */
async function callProductAgent(analysis, ticketData) {
  const query = buildProductQuery(analysis, ticketData.ticket.subject);
  const { quantity, urgent } = extractProductContext(analysis);

  const result = await queryProductAgent(query, {
    ticketId: ticketData.ticket.id,
    customerEmail: ticketData.customer.email,
    quantity,
    urgent: urgent || analysis.urgent || false,
  });

  return result;
}
