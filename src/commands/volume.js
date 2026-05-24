import { SlashCommandBuilder } from 'discord.js';
import { setVolume } from '../librespot.js';

export default {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the playback volume (0–100)')
    .addIntegerOption(o =>
      o.setName('level')
       .setDescription('Volume level (0 = mute, 100 = max)')
       .setRequired(true)
       .setMinValue(0)
       .setMaxValue(100)
    ),

  async execute(interaction) {
    const level = interaction.options.getInteger('level');
    await setVolume(level);
    const emoji = level === 0 ? '🔇' : level < 40 ? '🔈' : level < 75 ? '🔉' : '🔊';
    await interaction.reply(`${emoji} Volume set to **${level}%**`);
  },
};
