import { SlashCommandBuilder } from 'discord.js';
import { next } from '../librespot.js';

export default {
  data: new SlashCommandBuilder()
    .setName('next')
    .setDescription('Play the next track'),

  async execute(interaction) {
    await next();
    await interaction.reply('⏭ Played next track.');
  },
};
