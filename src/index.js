import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { startLibrespot, watchTrackChanges } from './player.js';
import { createAlexaWebhook } from './alexa/webhook.js';

// ── Start go-librespot immediately ───────────────────────────────────────────
startLibrespot();

// ── Discord client setup ─────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = new Collection();

// ── Load all slash commands from commands/ directory ─────────────────────────
const commandFiles = readdirSync('./src/commands').filter(f => f.endsWith('.js'));
const commandDefs  = [];

for (const file of commandFiles) {
  const cmd = await import(`./commands/${file}`);
  client.commands.set(cmd.default.data.name, cmd.default);
  commandDefs.push(cmd.default.data.toJSON());
  console.log(`[commands] loaded: /${cmd.default.data.name}`);
}

// ── Register slash commands with Discord ─────────────────────────────────────
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

try {
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.DISCORD_CLIENT_ID,
      process.env.GUILD_ID,
    ),
    { body: commandDefs },
  );
  console.log('[discord] slash commands registered ✓');
} catch (err) {
  console.error('[discord] failed to register commands:', err.message);
}

// ── Bot ready ────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`[discord] logged in as ${client.user.tag} ✓`);
  client.user.setActivity('Spotify 🎵', { type: 2 }); // "Listening to Spotify"

  // Watch for track changes and log them
  await watchTrackChanges((track) => {
    const artists = track.artist?.join(', ') || 'Unknown';
    console.log(`[librespot] ▶ Now playing: ${track.name} — ${artists}`);
  });
});

// ── Handle slash command interactions ────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;

  try {
    await cmd.execute(interaction);
  } catch (err) {
    console.error(`[commands] error in /${interaction.commandName}:`, err);
    try {
      const msg = { content: '❌ Something went wrong.', ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg);
      } else {
        await interaction.reply(msg);
      }
    } catch (replyErr) {
      console.error(`[commands] failed to send error reply:`, replyErr.message);
    }
  }
});

// ── Start Alexa webhook server ───────────────────────────────────────────────
createAlexaWebhook();

// ── Login ────────────────────────────────────────────────────────────────────
await client.login(process.env.DISCORD_TOKEN);
