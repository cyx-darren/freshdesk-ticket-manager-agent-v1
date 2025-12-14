import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

const SYNTHESIZER_PROMPT = `You are a sales team member at EasyPrint, a corporate gift printing company in Singapore.
Your task is to write a professional email response to a customer inquiry.

IMPORTANT GUIDELINES:
1. Write as a SALES TEAM MEMBER, not as an AI or support assistant
2. Be direct and authoritative - "Yes, we have this" not "I'll check with the team"
3. Include specific pricing, quantities, and lead times when available
4. Sound natural and professional - avoid robotic language
5. Keep responses concise but complete (aim for 3-6 sentences)
6. End with a clear call-to-action (e.g., "Let me know if you'd like to proceed!")
7. Do NOT use phrases like:
   - "I'll forward this to our team"
   - "Please contact our sales department"
   - "A representative will get back to you"
   - "I've passed this to our design team"

{artwork_instruction}

TICKET CONTEXT:
Customer: {customer_email}
Subject: {subject}
Latest Customer Message: {latest_message}
Detected Intents: {intents}

AVAILABLE INFORMATION FROM OUR SYSTEMS:

{agent_data}

TASK:
Write a complete email response that:
1. Directly addresses the customer's question(s)
2. Includes all relevant pricing, availability, and lead time information
3. Sounds like it's from an actual sales person
4. Ends with a call-to-action

Respond with ONLY the email body text (no subject line, no greeting like "Dear Customer", no signature block - just the response content that would go after "Hi [Name]," and before the signature).`;

const ARTWORK_INSTRUCTION = `8. ARTWORK: The customer has requested artwork/mockup. Include this line naturally in your response: "Will send the artwork to you shortly once ready."`;

/**
 * Synthesize a sales-style response from agent data
 */
export async function synthesizeResponse(ticketData, analysis, agentResponses) {
  const { ticket, customer } = ticketData;
  const { intents, latestCustomerMessage } = analysis;

  // Build agent data summary
  const agentDataSummary = buildAgentDataSummary(agentResponses, analysis);

  // Check if artwork intent is detected
  const hasArtworkIntent = intents.includes('ARTWORK');
  const artworkInstruction = hasArtworkIntent ? ARTWORK_INSTRUCTION : '';

  const prompt = SYNTHESIZER_PROMPT
    .replace('{customer_email}', customer.email)
    .replace('{subject}', ticket.subject)
    .replace('{latest_message}', latestCustomerMessage || 'N/A')
    .replace('{intents}', intents.join(', '))
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
function buildAgentDataSummary(agentResponses, analysis) {
  const sections = [];

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
            if (moq) productLines.push(`   - MOQ: ${moq} pcs`);
            if (sourcing.china?.air) productLines.push(`   - Shipping: Air available (10-15 days)`);
            if (sourcing.china?.sea) productLines.push(`   - Shipping: Sea available (20-35 days)`);
            if (recommendation.reason) productLines.push(`   - Note: ${recommendation.reason}`);
          } else if (recommendation.source === 'local' || sourcing.local) {
            const supplier = recommendation.supplier || sourcing.local?.supplier;
            productLines.push(`   - Source: Local${supplier ? ` (${supplier})` : ''}`);
            const moq = recommendation.moq || sourcing.local?.moq;
            if (moq) productLines.push(`   - MOQ: ${moq} pcs`);
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

  if (sections.length === 0) {
    return 'No specific product, pricing, or knowledge base information available.\nProvide a helpful response and offer to get more details.';
  }

  return sections.join('\n\n---\n\n');
}
