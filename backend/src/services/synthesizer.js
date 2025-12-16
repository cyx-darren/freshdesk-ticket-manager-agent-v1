import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

const SYNTHESIZER_PROMPT = `You are writing an email response for EasyPrint, a corporate gift printing company in Singapore.

STRICT RULES:
1. NEVER invent or estimate prices - ONLY use exact prices from PRICING INFORMATION section below
2. If no pricing data is provided, say "I will get back to you with a quotation shortly."
3. Follow the EXACT template structure below
4. Do NOT add extra commentary or explanations beyond the template

CONTEXT:
- Email Count: {email_count} (if > 1 = reply, if = 1 = new enquiry)
- Customer: {customer_email}
- Subject: {subject}
- Latest Message: {latest_message}
- Detected Intents: {intents}
- Customer Requested Quantity: {requested_quantity}

AVAILABLE DATA:
{agent_data}

RESPONSE TEMPLATE (follow this structure exactly):

1. OPENING (required - choose based on email count):
   - If email_count > 1: "Thank you for your reply!"
   - If email_count = 1: "Thank you for your enquiry!"

2. PRODUCT & PRICING (required):
   - If PRICING INFORMATION section has prices:
     "For [product name], here are the pricing for your kind consideration. The pricing provided are inclusive of free delivery and 9% GST."
     Then list the prices EXACTLY as shown in the data.
   - If NO pricing in the data:
     "For [product name], I will get back to you with a quotation shortly."

3. LEAD TIME (include if available in data):
   - Format: "Lead time is X-Y working days via [air/sea] freight."

4. MOQ NOTE (only include if MOQ_SHOULD_SHOW is true):
   - "Do kindly note that the minimum order quantity for [product] is [X] pcs."

{artwork_instruction}

5. CLOSING (required):
   - "Thank you, and looking forward to your reply!"

Write ONLY the email body text now (no greeting, no signature):`;

const ARTWORK_INSTRUCTION = `
ARTWORK (include this exact line if artwork/mockup was requested):
   - "Will send the artwork to you shortly once ready."`;

/**
 * Synthesize a sales-style response from agent data
 * @param {Object} synonymMap - Optional mapping of customer terms to canonical product names
 */
export async function synthesizeResponse(ticketData, analysis, agentResponses, synonymMap = {}) {
  const { ticket, customer, emailCount } = ticketData;
  const { intents, latestCustomerMessage, extractedEntities } = analysis;

  // Get customer's requested quantity
  const requestedQuantity = extractedEntities?.quantity || null;

  // Build agent data summary with MOQ logic
  const agentDataSummary = buildAgentDataSummary(agentResponses, analysis, requestedQuantity);

  // Check if artwork intent is detected
  const hasArtworkIntent = intents.includes('ARTWORK');
  const artworkInstruction = hasArtworkIntent ? ARTWORK_INSTRUCTION : '';

  const prompt = SYNTHESIZER_PROMPT
    .replace('{email_count}', String(emailCount || 1))
    .replace('{customer_email}', customer.email)
    .replace('{subject}', ticket.subject)
    .replace('{latest_message}', latestCustomerMessage || 'N/A')
    .replace('{intents}', intents.join(', '))
    .replace('{requested_quantity}', requestedQuantity ? `${requestedQuantity} pcs` : 'Not specified')
    .replace('{agent_data}', agentDataSummary)
    .replace('{artwork_instruction}', artworkInstruction);

  try {
    logger.info(`Synthesizing response for ticket #${ticket.id}`);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const suggestedResponse = response.content[0].text.trim();

    logger.info(`Synthesized response for ticket #${ticket.id} (${suggestedResponse.length} chars)`);

    return {
      success: true,
      suggestedResponse,
      hasArtworkIntent,
      intentsUsed: intents,
    };
  } catch (error) {
    logger.error(`Failed to synthesize response for ticket #${ticket.id}:`, error.message);
    return {
      success: false,
      error: error.message,
      suggestedResponse: null,
    };
  }
}

/**
 * Build a summary of agent data for the synthesizer prompt
 */
function buildAgentDataSummary(agentResponses, analysis, requestedQuantity) {
  const sections = [];
  let moqValue = null; // Track MOQ for conditional display

  // Product availability data
  if (agentResponses.product?.success) {
    const product = agentResponses.product;
    const productLines = ['PRODUCT AVAILABILITY:'];

    if (product.found) {
      productLines.push('- Products found: Yes');
      if (product.synonymResolved) {
        productLines.push(`- Matched term: "${product.synonymResolved}"`);
      }
      productLines.push(`- Color available: ${product.colorAvailable ? 'Yes' : 'No (check alternatives)'}`);

      if (product.products?.length > 0) {
        productLines.push('\nMatching products:');
        product.products.slice(0, 3).forEach((item, index) => {
          const productData = item.product || item;
          const name = productData.name || productData.product_name || 'Unknown';
          const recommendation = item.recommendation || {};
          const sourcing = productData.sourcing || {};

          productLines.push(`${index + 1}. ${name}`);

          if (recommendation.source === 'china') {
            productLines.push(`   - Source: China`);
            const moq = recommendation.moq || sourcing.china?.moq;
            if (moq) {
              productLines.push(`   - MOQ: ${moq} pcs`);
              if (!moqValue) moqValue = parseInt(moq, 10); // Track first MOQ found
            }
            if (sourcing.china?.air) productLines.push(`   - Shipping: Air available (10-15 days)`);
            if (sourcing.china?.sea) productLines.push(`   - Shipping: Sea available (20-35 days)`);
            if (recommendation.reason) productLines.push(`   - Note: ${recommendation.reason}`);
          } else if (recommendation.source === 'local' || sourcing.local) {
            const supplier = recommendation.supplier || sourcing.local?.supplier;
            productLines.push(`   - Source: Local${supplier ? ` (${supplier})` : ''}`);
            const moq = recommendation.moq || sourcing.local?.moq;
            if (moq) {
              productLines.push(`   - MOQ: ${moq} pcs`);
              if (!moqValue) moqValue = parseInt(moq, 10); // Track first MOQ found
            }
            const leadTime = recommendation.leadTime || sourcing.local?.leadTime;
            if (leadTime) productLines.push(`   - Lead time: ${leadTime}`);
          }
        });
      }
    } else {
      productLines.push('- Products found: No matching products');
    }

    sections.push(productLines.join('\n'));
  }

  // Pricing data
  if (agentResponses.price?.success && agentResponses.price.results?.length > 0) {
    const priceLines = ['PRICING INFORMATION:'];
    const priceData = agentResponses.price;

    priceData.results.slice(0, 3).forEach((result, index) => {
      priceLines.push(`\n${index + 1}. ${result.product_name}`);
      if (result.dimensions) priceLines.push(`   Size: ${result.dimensions}`);
      if (result.print_option) priceLines.push(`   Print: ${result.print_option}`);

      if (result.pricing) {
        const { requested_quantity, unit_price, total_price, currency } = result.pricing;
        priceLines.push(`   Price for ${requested_quantity} pcs: ${currency} ${unit_price.toFixed(2)}/pc (Total: ${currency} ${total_price.toFixed(2)})`);
      }

      if (result.moq) {
        priceLines.push(`   MOQ: ${result.moq.quantity} pcs @ $${result.moq.unit_price.toFixed(2)}/pc`);
        if (!moqValue) moqValue = result.moq.quantity; // Track MOQ from pricing
      }

      if (result.lead_time) {
        priceLines.push(`   Lead time: ${result.lead_time.days_min}-${result.lead_time.days_max} working days`);
      }

      if (result.all_tiers?.length > 1) {
        const tiers = result.all_tiers
          .slice(0, 4)
          .map(t => `${t.quantity}+ @ $${t.unit_price.toFixed(2)}`)
          .join(', ');
        priceLines.push(`   Quantity tiers: ${tiers}`);
      }
    });

    sections.push(priceLines.join('\n'));
  } else if (agentResponses.price?.success && agentResponses.price.productsFound === 0) {
    sections.push('PRICING INFORMATION:\n- No standard pricing found in pricelist\n- Offer to provide a custom quote');
  }

  // Knowledge base data
  if (agentResponses.knowledge?.success && agentResponses.knowledge.answer) {
    const kbLines = ['KNOWLEDGE BASE INFORMATION:'];
    kbLines.push(agentResponses.knowledge.answer);
    sections.push(kbLines.join('\n'));
  }

  // Extracted entities from analysis
  if (analysis.extractedEntities) {
    const entities = analysis.extractedEntities;
    const entityLines = ['CUSTOMER REQUEST DETAILS:'];

    if (entities.products?.length > 0) {
      entityLines.push(`- Products mentioned: ${entities.products.join(', ')}`);
    }
    if (entities.quantity) {
      entityLines.push(`- Quantity requested: ${entities.quantity}`);
    }
    if (entities.colors?.length > 0) {
      entityLines.push(`- Colors mentioned: ${entities.colors.join(', ')}`);
    }
    if (entities.customization?.length > 0) {
      entityLines.push(`- Customization: ${entities.customization.join(', ')}`);
    }

    if (entityLines.length > 1) {
      sections.push(entityLines.join('\n'));
    }
  }

  // Determine if MOQ should be shown based on conditions:
  // 1. Customer asked about MOQ, or
  // 2. Customer's requested quantity is less than MOQ
  const customerMessage = (analysis.latestCustomerMessage || '').toLowerCase();
  const askedAboutMoq = customerMessage.includes('moq') ||
    customerMessage.includes('minimum order') ||
    customerMessage.includes('minimum qty') ||
    customerMessage.includes('minimum quantity');

  const quantityBelowMoq = moqValue && requestedQuantity && requestedQuantity < moqValue;
  const moqShouldShow = askedAboutMoq || quantityBelowMoq;

  // Add MOQ instruction section
  sections.push(`MOQ_SHOULD_SHOW: ${moqShouldShow ? 'true' : 'false'}${moqValue ? ` (MOQ is ${moqValue} pcs)` : ''}`);

  if (sections.length === 1) { // Only the MOQ flag
    return 'No specific product, pricing, or knowledge base information available.\nProvide a helpful response and offer to get more details.\n\n' + sections[0];
  }

  return sections.join('\n\n---\n\n');
}
