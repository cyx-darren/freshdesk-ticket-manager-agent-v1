import { EmbedBuilder } from 'discord.js';

const STATUS_MAP = {
  2: 'Open',
  3: 'Pending',
  4: 'Resolved',
  5: 'Closed',
};

const PRIORITY_MAP = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Urgent',
};

export function buildTicketEmbed(data) {
  const { ticket, analysis, agentResponses, freshdeskUrl } = data;

  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle(`Ticket #${ticket.id}`)
    .setURL(freshdeskUrl)
    .setTimestamp()
    .setFooter({ text: 'AI Ticket Manager' });

  // Customer info
  embed.addFields({
    name: 'Customer',
    value: ticket.customer?.email || 'Unknown',
    inline: true,
  });

  // Status
  embed.addFields({
    name: 'Status',
    value: STATUS_MAP[ticket.status] || 'Unknown',
    inline: true,
  });

  // Priority
  embed.addFields({
    name: 'Priority',
    value: PRIORITY_MAP[ticket.priority] || 'Unknown',
    inline: true,
  });

  // Subject
  embed.addFields({
    name: 'Subject',
    value: truncate(ticket.subject, 1024),
    inline: false,
  });

  // Thread summary
  if (analysis?.threadSummary) {
    embed.addFields({
      name: `Conversation Summary (${analysis.emailCount || 0} emails)`,
      value: truncate(analysis.threadSummary, 1024),
      inline: false,
    });
  }

  // Latest customer message
  if (analysis?.latestCustomerMessage) {
    embed.addFields({
      name: 'Latest Customer Message',
      value: truncate(analysis.latestCustomerMessage, 1024),
      inline: false,
    });
  }

  // Detected intents
  if (analysis?.intents?.length > 0) {
    embed.addFields({
      name: 'Detected Intent',
      value: analysis.intents.join(' + '),
      inline: false,
    });
  }

  // KB Agent response
  if (agentResponses?.knowledge?.success) {
    const kb = agentResponses.knowledge;
    const answer = kb.answer || '';

    // Split long answers into chunks of ~1000 chars (leaving room for formatting)
    const chunks = splitIntoChunks(answer, 1000);

    chunks.forEach((chunk, index) => {
      embed.addFields({
        name: index === 0 ? 'Knowledge Base Answer' : '​', // Zero-width space for continuation
        value: chunk,
        inline: false,
      });
    });

    // Add sources as separate field
    if (kb.sources?.length > 0) {
      const sources = kb.sources
        .slice(0, 3)
        .map(s => `[${s.title || `Article #${s.id}`}](${s.url})`)
        .join('\n');
      embed.addFields({
        name: 'Sources',
        value: sources,
        inline: false,
      });
    }
  }

  // Product Agent response
  if (agentResponses?.product?.success) {
    const product = agentResponses.product;
    const formattedProduct = formatProductResults(product);

    const productChunks = splitIntoChunks(formattedProduct, 1000);

    productChunks.forEach((chunk, index) => {
      embed.addFields({
        name: index === 0 ? 'Product Availability' : '​',
        value: chunk,
        inline: false,
      });
    });
  } else if (agentResponses?.product && !agentResponses.product.success) {
    embed.addFields({
      name: 'Product Availability',
      value: agentResponses.product.error || 'Product lookup failed.',
      inline: false,
    });
  }

  // Price Agent response
  if (agentResponses?.price?.success && agentResponses.price.results?.length > 0) {
    const priceData = agentResponses.price;
    const formattedPricing = formatPriceResults(priceData.results);

    // Split pricing into chunks if needed
    const priceChunks = splitIntoChunks(formattedPricing, 1000);

    priceChunks.forEach((chunk, index) => {
      embed.addFields({
        name: index === 0 ? `Pricing (${priceData.productsFound} products found)` : '​',
        value: chunk,
        inline: false,
      });
    });

    // Show alternatives if main results are limited
    if (priceData.alternatives?.length > 0 && priceData.results.length < 3) {
      const altNames = priceData.alternatives
        .slice(0, 3)
        .map(a => a.product_name)
        .join(', ');
      embed.addFields({
        name: 'Similar Products',
        value: truncate(altNames, 1024),
        inline: false,
      });
    }
  } else if (agentResponses?.price?.success && agentResponses.price.productsFound === 0) {
    // Price agent was called but found no matching products
    embed.addFields({
      name: 'Pricing',
      value: 'No pricing found in pricelist for this product. Contact sales for a custom quote.',
      inline: false,
    });
  } else if (agentResponses?.price && !agentResponses.price.success) {
    // Price agent was called but failed
    embed.addFields({
      name: 'Pricing',
      value: agentResponses.price.error || 'Price lookup failed. Contact sales for a quote.',
      inline: false,
    });
  }

  return embed;
}

/**
 * Format product availability results for Discord display
 */
function formatProductResults(product) {
  const lines = [];

  // Synonym resolution
  if (product.synonymResolved) {
    lines.push(`🔍 **Matched:** "${product.synonymResolved}"`);
  }

  // Availability status
  if (product.found) {
    lines.push(`✅ **Available:** Yes`);
    if (product.colorAvailable) {
      lines.push(`🎨 Requested color: Available`);
    } else {
      lines.push(`⚠️ Requested color: Not available (check alternatives)`);
    }
  } else {
    lines.push(`❌ **Available:** No matching products found`);
  }

  // Product list - handle nested structure from Product Agent
  if (product.products?.length > 0) {
    lines.push('');
    lines.push(`📦 **Products found (${product.products.length}):**`);
    product.products.slice(0, 3).forEach((item, index) => {
      // Handle nested product structure: item.product.name or item.name
      const productData = item.product || item;
      const name = productData.name || productData.product_name || 'Unknown';
      const url = productData.url || item.url;
      const recommendation = item.recommendation || {};
      const sourcing = productData.sourcing || {};

      lines.push(`${index + 1}. **${name}**`);

      if (url) {
        lines.push(`   🔗 easyprint.sg${url}`);
      }

      // Sourcing recommendation - display based on source type
      if (recommendation.source === 'china') {
        // China sourcing
        lines.push(`   🏭 **Source: CHINA** 🇨🇳`);

        // China MOQ
        const chinaMoq = recommendation.moq || sourcing.china?.moq;
        if (chinaMoq) {
          lines.push(`   📦 MOQ: ${chinaMoq} pcs`);
        }

        // Shipping options
        if (sourcing.china) {
          const shipping = [];
          if (sourcing.china.air) shipping.push('Air');
          if (sourcing.china.sea) shipping.push('Sea');
          if (shipping.length > 0) {
            lines.push(`   ✈️ Shipping: ${shipping.join(' / ')}`);
          }
        }

        // Reason for China recommendation
        if (recommendation.reason) {
          lines.push(`   💡 ${recommendation.reason}`);
        }
      } else if (recommendation.source === 'local' || sourcing.local) {
        // Local sourcing
        const supplier = recommendation.supplier || sourcing.local?.supplier;
        lines.push(`   🏭 **Source: LOCAL** ${supplier ? `(${supplier})` : ''}`);

        // Local MOQ
        const localMoq = recommendation.moq || sourcing.local?.moq;
        if (localMoq) {
          lines.push(`   📦 MOQ: ${localMoq} pcs`);
        }

        // Lead time
        const leadTime = recommendation.leadTime || sourcing.local?.leadTime;
        if (leadTime) {
          lines.push(`   ⏱️ Lead time: ${leadTime}`);
        }
      } else if (recommendation.source) {
        // Fallback for other source types
        lines.push(`   🏭 Source: ${recommendation.source.toUpperCase()}`);
        if (recommendation.moq) {
          lines.push(`   📦 MOQ: ${recommendation.moq} pcs`);
        }
      }
    });
  }

  // Summary from Product Agent
  if (product.summary) {
    lines.push('');
    lines.push(`💬 ${product.summary}`);
  }

  return lines.join('\n') || 'No availability information found.';
}

/**
 * Format price results for Discord display
 */
function formatPriceResults(results) {
  if (!results || results.length === 0) {
    return 'No products found matching your query.';
  }

  return results
    .slice(0, 5) // Limit to 5 products
    .map(result => {
      const lines = [];

      lines.push(`**${result.product_name}**`);

      if (result.dimensions) {
        lines.push(`📐 ${result.dimensions}`);
      }

      if (result.print_option) {
        lines.push(`🖨️ ${result.print_option}`);
      }

      if (result.pricing) {
        const { requested_quantity, unit_price, total_price, currency } = result.pricing;
        lines.push(`💰 **${requested_quantity} pcs @ ${currency} ${unit_price.toFixed(2)}/pc = ${currency} ${total_price.toFixed(2)}**`);
      }

      if (result.moq) {
        lines.push(`📦 MOQ: ${result.moq.quantity} pcs @ $${result.moq.unit_price.toFixed(2)}/pc`);
      }

      if (result.lead_time) {
        const lt = result.lead_time;
        lines.push(`⏱️ ${lt.days_min}-${lt.days_max} working days (${lt.type})`);
      }

      // Show tier pricing
      if (result.all_tiers?.length > 1) {
        const tiers = result.all_tiers
          .slice(0, 4)
          .map(t => `${t.quantity}+ @ $${t.unit_price.toFixed(2)}`)
          .join(' | ');
        lines.push(`📊 ${tiers}`);
      }

      return lines.join('\n');
    })
    .join('\n\n');
}

export function buildErrorEmbed(message, ticketId = null) {
  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle(ticketId ? `Error: Ticket #${ticketId}` : 'Error')
    .setDescription(message)
    .setTimestamp()
    .setFooter({ text: 'AI Ticket Manager' });

  return embed;
}

export function buildLoadingEmbed(ticketId) {
  const embed = new EmbedBuilder()
    .setColor(0xffff00)
    .setTitle(`Analyzing Ticket #${ticketId}...`)
    .setDescription('Fetching ticket data and consulting agents. This may take a few seconds.')
    .setTimestamp()
    .setFooter({ text: 'AI Ticket Manager' });

  return embed;
}

function truncate(str, maxLength) {
  if (!str) return 'N/A';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

function splitIntoChunks(str, maxLength) {
  if (!str) return ['N/A'];
  if (str.length <= maxLength) return [str];

  const chunks = [];
  let remaining = str;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline or space to avoid breaking words
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trim();
  }

  return chunks;
}
