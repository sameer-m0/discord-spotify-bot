import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getStatus } from '../librespot.js';

function formatMs(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function progressBar(position, duration, length = 20) {
  const pct  = Math.min(1, position / duration);
  const fill = Math.round(pct * length);
  return '▓'.repeat(fill) + '░'.repeat(length - fill);
}

export default {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show the currently playing track'),

  async execute(interaction) {
    const status = await getStatus();

    if (!status?.track?.name) {
      return interaction.reply({ content: '🔇 Nothing is playing right now.', ephemeral: true });
    }

    const { track, position_ms, duration_ms, paused } = status;
    const artists   = track.artist?.join(', ') || 'Unknown Artist';
    const bar       = progressBar(position_ms ?? 0, duration_ms ?? 1);
    const timeLabel = `${formatMs(position_ms ?? 0)} ${bar} ${formatMs(duration_ms ?? 0)}`;

    const embed = new EmbedBuilder()
      .setColor(paused ? 0x888888 : 0x1DB954)
      .setTitle(track.name)
      .setDescription(`**${artists}**\n${track.album || ''}`)
      .addFields({ name: paused ? '⏸ Paused' : '▶ Playing', value: timeLabel })
      .setFooter({ text: 'Streaming via Spotify · go-librespot' })
      .setTimestamp();

    if (track.image_url) {
      embed.setThumbnail(track.image_url);
    }

    await interaction.reply({ embeds: [embed] });
  },
};
