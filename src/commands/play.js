import { SlashCommandBuilder } from 'discord.js';
import { joinChannel } from '../player.js';
import { loadTrack, play, urlToUri, searchTrack } from '../librespot.js';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a Spotify track/playlist/album, or resume')
    .addStringOption(o =>
      o.setName('query')
       .setDescription('Spotify link, URI, or song name')
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
      let uri = urlToUri(input);
      let title = input;

      if (!uri) {
        // If not a direct URI/link, search for the song
        await interaction.editReply(`🔍 Searching for \`${input}\` on Spotify...`);
        const searchResult = await searchTrack(input);
        if (!searchResult) {
          return interaction.editReply(`❌ No tracks found for \`${input}\`.`);
        }
        uri = searchResult.uri;
        title = `${searchResult.name} — ${searchResult.artist}`;
      }

      await loadTrack(uri);
      await interaction.editReply(`▶ Playing **${title}** (\`${uri}\`)`);
    } else {
      await play();
      await interaction.editReply('▶ Resumed.');
    }
  },
};

