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
    let kbValue = truncate(kb.answer, 900);

    // Add sources if available
    if (kb.sources?.length > 0) {
      const sources = kb.sources
        .slice(0, 3)
        .map(s => `[${s.title || `Article #${s.id}`}](${s.url})`)
        .join('\n');
      kbValue += `\n\n**Sources:**\n${sources}`;
    }

    embed.addFields({
      name: 'Knowledge Base Answer',
      value: kbValue,
      inline: false,
    });
  }

  return embed;
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
