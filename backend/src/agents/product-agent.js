import axios from 'axios';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

const productApi = axios.create({
  baseURL: config.productAgent.url,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': config.productAgent.apiKey,
  },
});

/**
 * Query the Product Agent for availability and sourcing information
 */
export async function queryProductAgent(query, context = {}) {
  try {
    logger.info(`Querying Product Agent: "${query.substring(0, 100)}..."`);

    const response = await productApi.post('/api/product/availability', {
      query,
      quantity: context.quantity || null,
      urgent: context.urgent || false,
    });

    const data = response.data;

    if (!data.success) {
      logger.warn('Product Agent returned unsuccessful response:', data);
      return {
        success: false,
        error: data.error || 'Product lookup failed',
        found: false,
        products: [],
      };
    }

    const availability = data.data?.availability || {};

    logger.info(`Product Agent found: ${availability.found ? 'Yes' : 'No'}, Products: ${availability.matchingProducts?.length || 0}`);

    return {
      success: true,
      query: data.data?.query,
      parsed: data.data?.parsed,
      synonymResolved: data.data?.synonymResolved,
      found: availability.found || false,
      colorAvailable: availability.colorAvailable || false,
      products: availability.matchingProducts || [],
      summary: data.data?.summary,
    };
  } catch (error) {
    logger.error('Product Agent query failed:', error.message || error);
    if (error.response) {
      logger.error('Product Agent error response:', error.response.status, error.response.data);
    }

    return {
      success: false,
      error: error.message || 'Unknown error',
      found: false,
      products: [],
    };
  }
}

/**
 * Build a product query from ticket analysis
 * Includes quantity in query text so Product Agent can parse it
 */
export function buildProductQuery(analysis, ticketSubject) {
  const { latestCustomerMessage, extractedEntities } = analysis;

  // Start with the customer message (contains quantity info)
  let query = latestCustomerMessage || ticketSubject;

  // If we have extracted entities, enhance but keep quantity context
  if (extractedEntities) {
    const parts = [];

    // Add products
    if (extractedEntities.products?.length > 0) {
      parts.push(extractedEntities.products.join(' '));
    }

    // Add any color or customization details
    if (extractedEntities.customization?.length > 0) {
      parts.push(extractedEntities.customization.join(' '));
    }

    // Add quantity from extracted entities or original message
    if (extractedEntities.quantity) {
      // Include quantity string (e.g., "5000pcs" or "5000 pieces")
      const qtyStr = String(extractedEntities.quantity);
      if (!qtyStr.toLowerCase().includes('pcs') && !qtyStr.toLowerCase().includes('piece')) {
        parts.push(`${qtyStr} pcs`);
      } else {
        parts.push(qtyStr);
      }
    }

    // If we have meaningful extracted parts, use them
    if (parts.length > 0) {
      query = parts.join(' ');
    }
  }

  logger.info(`Built Product Agent query: "${query}"`);
  return query;
}

/**
 * Extract quantity and urgency from analysis
 * Note: Quantity parsing from text is handled by Product Agent
 */
export function extractProductContext(analysis) {
  const { extractedEntities, latestCustomerMessage } = analysis;

  // Pass quantity if it's a valid number, otherwise let Product Agent parse from query
  const quantity = typeof extractedEntities?.quantity === 'number'
    ? extractedEntities.quantity
    : null;

  // Check for urgency keywords in the message
  const urgentKeywords = ['urgent', 'rush', 'asap', 'immediately', 'quickly', 'fast', 'express'];
  const msgText = (latestCustomerMessage || '').toLowerCase();
  const urgent = urgentKeywords.some(keyword => msgText.includes(keyword));

  return { quantity, urgent };
}

/**
 * Format product result for display
 */
export function formatProductResult(result) {
  const lines = [];

  if (result.synonymResolved) {
    lines.push(`Matched: "${result.synonymResolved}"`);
  }

  if (result.found) {
    lines.push(`Available: Yes`);
    if (result.colorAvailable) {
      lines.push(`Requested color: Available`);
    }
  } else {
    lines.push(`Available: No matching products found`);
  }

  if (result.products?.length > 0) {
    lines.push(`\nProducts found (${result.products.length}):`);
    result.products.slice(0, 3).forEach((product, index) => {
      lines.push(`${index + 1}. ${product.name || product.product_name || 'Unknown'}`);
      if (product.url) {
        lines.push(`   URL: ${product.url}`);
      }
      if (product.sourcing_recommendation) {
        lines.push(`   Sourcing: ${product.sourcing_recommendation}`);
      }
    });
  }

  if (result.summary) {
    lines.push(`\nSummary: ${result.summary}`);
  }

  return lines.join('\n');
}
