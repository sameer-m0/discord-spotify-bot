import { SlashCommandBuilder } from 'discord.js';
import { prev } from '../librespot.js';

export default {
  data: new SlashCommandBuilder()
    .setName('prev')
    .setDescription('Go to the previous track'),

  async execute(interaction) {
    await prev();
    await interaction.reply('⏮ Going back.');
  },
};
