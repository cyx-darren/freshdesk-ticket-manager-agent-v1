import { analyzeTicket } from '../services/backendApi.js';
import { buildTicketEmbed, buildErrorEmbed, buildLoadingEmbed } from '../utils/embedBuilder.js';
import { logger } from '../utils/logger.js';

export const name = 'ticket';
export const description = 'Analyze a Freshdesk ticket';

export async function execute(message, args) {
  const ticketId = args[0];

  // Validate ticket ID
  if (!ticketId) {
    return message.reply({
      embeds: [buildErrorEmbed('Please provide a ticket ID. Usage: `!ticket <ticket_id>`')],
    });
  }

  if (!/^\d+$/.test(ticketId)) {
    return message.reply({
      embeds: [buildErrorEmbed('Invalid ticket ID. Please provide a numeric ticket ID.')],
    });
  }

  // Send loading message
  const loadingMsg = await message.reply({
    embeds: [buildLoadingEmbed(ticketId)],
  });

  try {
    logger.info(`Analyzing ticket #${ticketId} requested by ${message.author.tag}`);

    const result = await analyzeTicket(
      ticketId,
      message.author.id,
      message.channel.id
    );

    if (!result.success) {
      await loadingMsg.edit({
        embeds: [buildErrorEmbed(result.error || 'Failed to analyze ticket', ticketId)],
      });
      return;
    }

    const embed = buildTicketEmbed(result);
    await loadingMsg.edit({ embeds: [embed] });

    logger.info(`Ticket #${ticketId} analysis completed in ${result.processingTime}ms`);
  } catch (error) {
    logger.error(`Failed to analyze ticket #${ticketId}:`, error);

    let errorMessage = 'An unexpected error occurred while analyzing the ticket.';

    if (error.response?.status === 404) {
      errorMessage = `Ticket #${ticketId} not found in Freshdesk.`;
    } else if (error.response?.status === 401) {
      errorMessage = 'Authentication failed. Please check API credentials.';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Could not connect to backend service.';
    }

    await loadingMsg.edit({
      embeds: [buildErrorEmbed(errorMessage, ticketId)],
    });
  }
}
