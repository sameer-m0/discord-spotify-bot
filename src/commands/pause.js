import { SlashCommandBuilder } from 'discord.js';
import { pause } from '../librespot.js';

export default {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause playback'),

  async execute(interaction) {
    await pause();
    await interaction.reply('⏸ Paused.');
  },
};
