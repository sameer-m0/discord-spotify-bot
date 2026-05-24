import { SlashCommandBuilder } from 'discord.js';
import { disconnect } from '../player.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Disconnect the bot from the voice channel'),

  async execute(interaction) {
    disconnect();
    await interaction.reply('👋 Disconnected.');
  },
};
