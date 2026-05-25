import { SlashCommandBuilder } from 'discord.js';
import { joinChannel } from '../player.js';
import { loadTrack, play, urlToUri } from '../librespot.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a Spotify track/playlist/album, or resume')
    .addStringOption(o =>
      o.setName('uri')
       .setDescription('Spotify link or URI (e.g. https://open.spotify.com/track/...)')
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

    const input = interaction.options.getString('uri');

    if (input) {
      const uri = urlToUri(input);
      if (!uri) {
        return interaction.editReply('❌ Invalid Spotify link or URI. Paste a Spotify share URL.');
      }
      await loadTrack(uri);
      await interaction.editReply(`▶ Loading \`${uri}\`...`);
    } else {
      await play();
      await interaction.editReply('▶ Resumed.');
    }
  },
};
