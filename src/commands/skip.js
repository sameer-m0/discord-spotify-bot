import { SlashCommandBuilder } from 'discord.js';
import { next } from '../librespot.js';

export default {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip to the next track'),

  async execute(interaction) {
    await next();
    await interaction.reply('⏭ Skipped.');
  },
};
