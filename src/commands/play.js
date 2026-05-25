import { SlashCommandBuilder } from 'discord.js';
import { joinChannel } from '../player.js';
import { loadTrack, play, urlToUri, searchTrack } from '../librespot.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a Spotify track/playlist/album, or search for a song')
    .addStringOption(o =>
      o.setName('query')
       .setDescription('Spotify link, URI, or search query (e.g. Blinding Lights)')
       .setRequired(false)
    ),

  async execute(interaction) {
    const vc = interaction.member?.voice?.channel;
    if (!vc) {
      return interaction.reply({ content: '🔇 You need to be in a voice channel first!', ephemeral: true });
    }

    await interaction.deferReply();

    try {
      await joinChannel(vc);
    } catch (err) {
      return interaction.editReply(`❌ ${err.message}`);
    }

    const input = interaction.options.getString('query');

    if (input) {
      const uri = urlToUri(input);
      if (uri) {
        await loadTrack(uri);
        await interaction.editReply(`▶ Loading \`${uri}\`...`);
      } else {
        const track = await searchTrack(input);
        if (!track) {
          return interaction.editReply(`❌ No tracks found for \`${input}\``);
        }
        await loadTrack(track.uri);
        const artists = track.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
        await interaction.editReply(`▶ Playing **${track.name}** by **${artists}**`);
      }
    } else {
      await play();
      await interaction.editReply('▶ Resumed.');
    }
  },
};
