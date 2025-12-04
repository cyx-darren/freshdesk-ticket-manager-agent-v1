import { getFullTicketData } from './freshdesk.js';
import { classifyTicket } from './classifier.js';
import { queryKnowledgeBase, buildKBQuery } from '../agents/kb-agent.js';
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

  // Step 4: Build response
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

  // Price Agent (Phase 2 - placeholder)
  if (options.includePrice && intents.includes('PRICE')) {
    responses.price = {
      success: false,
      message: 'Price Agent not yet implemented (Phase 2)',
    };
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
