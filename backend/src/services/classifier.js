import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

// Debug: log if API key is loaded
if (!config.anthropic.apiKey) {
  console.error('WARNING: ANTHROPIC_API_KEY is not set!');
}

const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

const CLASSIFICATION_PROMPT = `You are analyzing a customer support ticket to classify the customer's intent.

TICKET INFORMATION:
Subject: {subject}
Customer: {customer_email}

CONVERSATION HISTORY:
{conversation_history}

TASK:
1. Provide a brief summary of the conversation thread (2-3 sentences)
2. Identify the customer's latest request/question
3. Classify the intent(s) from these categories:
   - KNOWLEDGE: Customer asking about product information, specifications, processes, policies
   - PRICE: Customer asking about pricing, quotes, costs, discounts
   - ARTWORK: Customer requesting design work, artwork files, mockups, or design changes
   - OTHER: None of the above

4. Extract relevant entities (products, quantities, specifications mentioned)

Respond ONLY with valid JSON in this exact format:
{
  "threadSummary": "...",
  "latestCustomerMessage": "...",
  "intents": ["KNOWLEDGE"],
  "extractedEntities": {
    "products": [],
    "quantity": null,
    "customization": [],
    "other": []
  },
  "confidence": 0.92
}`;

/**
 * Classify ticket intent and summarize conversation using Claude
 */
export async function classifyTicket(ticketData) {
  const { ticket, customer, conversations } = ticketData;

  // Build conversation history string
  const conversationHistory = conversations
    .map((msg, index) => {
      const sender = msg.incoming ? 'CUSTOMER' : 'AGENT';
      const date = new Date(msg.created_at).toLocaleDateString();
      return `[${index + 1}] ${sender} (${date}):\n${msg.body_text}`;
    })
    .join('\n\n---\n\n');

  const prompt = CLASSIFICATION_PROMPT
    .replace('{subject}', ticket.subject)
    .replace('{customer_email}', customer.email)
    .replace('{conversation_history}', conversationHistory);

  try {
    logger.info(`Classifying ticket #${ticket.id} with Claude`);

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

    const content = response.content[0].text;

    // Parse JSON response
    const result = parseJsonResponse(content);

    logger.info(`Ticket #${ticket.id} classified with intents: ${result.intents.join(', ')}`);

    return result;
  } catch (error) {
    logger.error(`Failed to classify ticket #${ticket.id}:`, error.message);
    throw error;
  }
}

/**
 * Parse JSON response from Claude, handling potential formatting issues
 */
function parseJsonResponse(content) {
  try {
    // Try direct parse first
    return JSON.parse(content);
  } catch {
    // Try to extract JSON from markdown code block
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }

    // Try to find JSON object in the content
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }

    throw new Error('Could not parse classification response as JSON');
  }
}
