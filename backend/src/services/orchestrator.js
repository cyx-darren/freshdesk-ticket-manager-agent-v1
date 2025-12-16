import { getFullTicketData } from './freshdesk.js';
import { classifyTicket } from './classifier.js';
import { synthesizeResponse } from './synthesizer.js';
import { resolveProductSynonyms, getCanonicalNames } from './synonymResolver.js';
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

  // Step 3: Resolve product synonyms to canonical names
  // This ensures Price Agent and Product Agent receive proper product names
  let synonymMap = {};
  const productTerms = analysis.extractedEntities?.products || [];

  if (productTerms.length > 0 &&
      (analysis.intents.includes('AVAILABILITY') || analysis.intents.includes('PRICE'))) {
    logger.info(`Resolving synonyms for: ${JSON.stringify(productTerms)}`);
    synonymMap = await resolveProductSynonyms(productTerms);
    const canonicalNames = getCanonicalNames(synonymMap);
    logger.info(`Resolved to canonical names: ${JSON.stringify(canonicalNames)}`);
  }

  // Step 4: Call relevant agents based on intent
  const agentResponses = await callAgents(analysis, ticketData, options, synonymMap);

  // Step 5: Synthesize a suggested response (sales team member style)
  let synthesizedResponse = null;
  if (options.includeSynthesis !== false) {
    synthesizedResponse = await synthesizeResponse(ticketData, analysis, agentResponses, synonymMap);
  }

  // Step 6: Build response
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
    synonymResolution: Object.keys(synonymMap).length > 0 ? synonymMap : null,
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
 * Product Agent runs FIRST so we can use its matched product names for Price Agent
 */
async function callAgents(analysis, ticketData, options, synonymMap = {}) {
  const { intents } = analysis;
  const responses = {
    knowledge: null,
    product: null,
    price: null,
    artwork: null,
  };

  const parallelPromises = [];

  // Knowledge Base Agent - runs in parallel
  if (options.includeKB !== false && (intents.includes('KNOWLEDGE') || intents.includes('OTHER'))) {
    const kbPromise = callKBAgent(analysis, ticketData)
      .then(result => { responses.knowledge = result; })
      .catch(error => {
        logger.error('KB Agent failed:', error);
        responses.knowledge = { success: false, error: error.message };
      });
    parallelPromises.push(kbPromise);
  }

  // Product Agent - runs FIRST (before Price Agent) to get canonical product names
  const needsProductAgent = options.includeProduct !== false && intents.includes('AVAILABILITY');
  const needsPriceAgent = options.includePrice !== false && intents.includes('PRICE');

  if (needsProductAgent) {
    try {
      responses.product = await callProductAgent(analysis, ticketData, synonymMap);
    } catch (error) {
      logger.error('Product Agent failed:', error);
      responses.product = { success: false, error: error.message };
    }
  }

  // Price Agent - uses product names from Product Agent response
  if (needsPriceAgent) {
    // Extract canonical product names from Product Agent response
    const canonicalProductNames = extractCanonicalNamesFromProductResponse(responses.product);

    if (canonicalProductNames.length > 0) {
      logger.info(`Using Product Agent matched names for Price Agent: ${canonicalProductNames.join(', ')}`);
    }

    const pricePromise = callPriceAgent(analysis, ticketData, synonymMap, canonicalProductNames)
      .then(result => { responses.price = result; })
      .catch(error => {
        logger.error('Price Agent failed:', error);
        responses.price = { success: false, error: error.message };
      });
    parallelPromises.push(pricePromise);
  }

  // Artwork Agent (Phase 2 - placeholder)
  if (options.includeArtwork && intents.includes('ARTWORK')) {
    responses.artwork = {
      success: false,
      message: 'Artwork Agent not yet implemented (Phase 2)',
    };
  }

  // Wait for parallel agents (KB Agent, Price Agent) to complete
  await Promise.all(parallelPromises);

  return responses;
}

/**
 * Extract canonical product names from Product Agent response
 */
function extractCanonicalNamesFromProductResponse(productResponse) {
  if (!productResponse?.success || !productResponse?.products) {
    return [];
  }

  const names = [];

  // Handle both single and multi-product responses
  const products = productResponse.products || [];

  products.forEach(product => {
    // Product Agent returns different structures - handle both
    const name = product.name || product.product_name || product.product?.name || product.product?.product_name;
    if (name) {
      names.push(name);
    }
  });

  // Also check for multi-product results structure
  if (productResponse.results) {
    productResponse.results.forEach(result => {
      if (result.availability?.matchingProducts) {
        result.availability.matchingProducts.forEach(mp => {
          const name = mp.name || mp.product_name || mp.product?.name || mp.product?.product_name;
          if (name && !names.includes(name)) {
            names.push(name);
          }
        });
      }
    });
  }

  return names;
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
 * @param {string[]} canonicalProductNames - Product names from Product Agent to use for query
 */
async function callPriceAgent(analysis, ticketData, synonymMap = {}, canonicalProductNames = []) {
  const query = buildPriceQuery(analysis, ticketData.ticket.subject, synonymMap, canonicalProductNames);

  const result = await queryPriceAgent(query, {
    ticketId: ticketData.ticket.id,
    customerEmail: ticketData.customer.email,
  });

  return result;
}

/**
 * Call the Product Agent
 */
async function callProductAgent(analysis, ticketData, synonymMap = {}) {
  const query = buildProductQuery(analysis, ticketData.ticket.subject, synonymMap);
  const { quantity, urgent } = extractProductContext(analysis);

  const result = await queryProductAgent(query, {
    ticketId: ticketData.ticket.id,
    customerEmail: ticketData.customer.email,
    quantity,
    urgent: urgent || analysis.urgent || false,
  });

  return result;
}
