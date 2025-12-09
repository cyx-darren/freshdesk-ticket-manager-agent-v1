import axios from 'axios';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

const priceApi = axios.create({
  baseURL: config.priceAgent.url,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.priceAgent.apiKey}`,
  },
});

/**
 * Query the Price Agent for product pricing information
 */
export async function queryPriceAgent(query, context = {}) {
  try {
    logger.info(`Querying Price Agent: "${query.substring(0, 100)}..."`);

    const response = await priceApi.post('/api/price/query', {
      query,
    });

    const data = response.data;

    if (!data.success) {
      logger.warn('Price Agent returned unsuccessful response:', data);
      return {
        success: false,
        error: data.error || 'Price lookup failed',
        results: [],
        productsFound: 0,
      };
    }

    logger.info(`Price Agent found ${data.data?.products_found || 0} products`);

    return {
      success: true,
      results: data.data?.results || [],
      alternatives: data.data?.alternatives || [],
      productsFound: data.data?.products_found || 0,
    };
  } catch (error) {
    logger.error('Price Agent query failed:', error.message || error);
    if (error.response) {
      logger.error('Price Agent error response:', error.response.status, error.response.data);
    }

    return {
      success: false,
      error: error.message || 'Unknown error',
      results: [],
      productsFound: 0,
    };
  }
}

/**
 * Build a price query string from ticket analysis
 */
export function buildPriceQuery(analysis, ticketSubject) {
  const { latestCustomerMessage, extractedEntities } = analysis;

  // Start with the customer message as it likely contains quantity and product info
  let query = latestCustomerMessage || ticketSubject;

  // If we have extracted entities, we can enhance the query
  if (extractedEntities) {
    const parts = [];

    // Add products
    if (extractedEntities.products?.length > 0) {
      parts.push(extractedEntities.products.join(' '));
    }

    // Add quantity if available
    if (extractedEntities.quantity) {
      parts.push(`${extractedEntities.quantity}pcs`);
    }

    // Add customization details (often includes print type)
    if (extractedEntities.customization?.length > 0) {
      parts.push(extractedEntities.customization.join(' '));
    }

    // If we have meaningful extracted parts, use them
    if (parts.length > 0) {
      query = parts.join(' ');
    }
  }

  return query;
}

/**
 * Format a single product result for display
 */
export function formatPriceResult(result) {
  const lines = [];

  lines.push(`**${result.product_name}**`);

  if (result.dimensions) {
    lines.push(`Size: ${result.dimensions}`);
  }

  if (result.print_option) {
    lines.push(`Print: ${result.print_option}`);
  }

  if (result.pricing) {
    const { requested_quantity, unit_price, total_price, currency } = result.pricing;
    lines.push(`**${requested_quantity} pcs @ ${currency} ${unit_price.toFixed(2)}/pc = ${currency} ${total_price.toFixed(2)}**`);
  }

  if (result.moq) {
    lines.push(`MOQ: ${result.moq.quantity} pcs @ ${result.pricing?.currency || 'SGD'} ${result.moq.unit_price.toFixed(2)}/pc`);
  }

  if (result.lead_time) {
    const lt = result.lead_time;
    lines.push(`Lead time: ${lt.days_min}-${lt.days_max} working days (${lt.type})`);
  }

  // Add tier pricing if available
  if (result.all_tiers?.length > 1) {
    const tiers = result.all_tiers
      .slice(0, 5) // Show up to 5 tiers
      .map(t => `${t.quantity}+ @ $${t.unit_price.toFixed(2)}`)
      .join(' | ');
    lines.push(`Tiers: ${tiers}`);
  }

  return lines.join('\n');
}
