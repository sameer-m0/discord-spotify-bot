import { SlashCommandBuilder } from 'discord.js';
import { play } from '../librespot.js';

export default {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume playback'),

  async execute(interaction) {
    await play();
    await interaction.reply('▶ Resumed.');
  },
};
