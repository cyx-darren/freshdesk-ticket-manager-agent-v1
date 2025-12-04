import { EmbedBuilder } from 'discord.js';

export const name = 'help';
export const description = 'Show available commands';

export async function execute(message) {
  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle('AI Ticket Manager - Help')
    .setDescription('Available commands for analyzing Freshdesk tickets.')
    .addFields(
      {
        name: '!ticket <ticket_id>',
        value: 'Analyze a Freshdesk ticket. Fetches ticket details, summarizes the conversation, and provides relevant knowledge base answers.',
        inline: false,
      },
      {
        name: '!help',
        value: 'Show this help message.',
        inline: false,
      }
    )
    .setFooter({ text: 'AI Ticket Manager' })
    .setTimestamp();

  return message.reply({ embeds: [embed] });
}
