import axios from 'axios';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

const freshdeskApi = axios.create({
  baseURL: `https://${config.freshdesk.domain}/api/v2`,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
  auth: {
    username: config.freshdesk.apiKey,
    password: 'X',
  },
});

/**
 * Fetch a ticket by ID from Freshdesk
 */
export async function getTicket(ticketId) {
  try {
    logger.info(`Fetching ticket #${ticketId} from Freshdesk`);
    const response = await freshdeskApi.get(`/tickets/${ticketId}`);
    return response.data;
  } catch (error) {
    logger.error(`Failed to fetch ticket #${ticketId}:`, error.message);
    throw error;
  }
}

/**
 * Fetch conversations (email thread) for a ticket
 */
export async function getTicketConversations(ticketId) {
  try {
    logger.info(`Fetching conversations for ticket #${ticketId}`);
    const response = await freshdeskApi.get(`/tickets/${ticketId}/conversations`);
    return response.data;
  } catch (error) {
    logger.error(`Failed to fetch conversations for ticket #${ticketId}:`, error.message);
    throw error;
  }
}

/**
 * Fetch requester (customer) details
 */
export async function getRequester(requesterId) {
  try {
    const response = await freshdeskApi.get(`/contacts/${requesterId}`);
    return response.data;
  } catch (error) {
    logger.error(`Failed to fetch requester #${requesterId}:`, error.message);
    return null;
  }
}

/**
 * Fetch complete ticket data including conversations and customer info
 */
export async function getFullTicketData(ticketId) {
  const ticket = await getTicket(ticketId);

  const [conversations, requester] = await Promise.all([
    getTicketConversations(ticketId),
    ticket.requester_id ? getRequester(ticket.requester_id) : null,
  ]);

  // Build conversation history with the initial ticket description
  const allMessages = [];

  // Add initial ticket as first message
  if (ticket.description_text || ticket.description) {
    allMessages.push({
      id: `ticket-${ticket.id}`,
      body_text: ticket.description_text || stripHtml(ticket.description),
      incoming: true,
      user_id: ticket.requester_id,
      created_at: ticket.created_at,
      isInitialTicket: true,
    });
  }

  // Add conversations
  if (conversations && conversations.length > 0) {
    allMessages.push(...conversations.map(conv => ({
      id: conv.id,
      body_text: conv.body_text || stripHtml(conv.body),
      incoming: conv.incoming,
      user_id: conv.user_id,
      created_at: conv.created_at,
      isInitialTicket: false,
    })));
  }

  // Sort by creation date
  allMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  return {
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
    },
    customer: requester ? {
      id: requester.id,
      email: requester.email,
      name: requester.name,
    } : {
      id: ticket.requester_id,
      email: ticket.requester?.email || 'Unknown',
      name: ticket.requester?.name || 'Unknown',
    },
    conversations: allMessages,
    emailCount: allMessages.length,
  };
}

/**
 * Strip HTML tags from a string
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}
