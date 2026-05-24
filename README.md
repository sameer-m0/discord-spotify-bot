# Discord Spotify Bot 🎵

Self-hosted Discord music bot that plays **real Spotify audio** (via go-librespot + Spotify Connect) into a voice channel. Controllable via Discord slash commands, your Spotify app, and Alexa.

---

## How it works

```
Spotify app / Alexa
      ↓  (Spotify Connect / REST)
go-librespot  ←→  [raw PCM pipe]  →  FFmpeg  →  discord.js  →  Discord voice channel
      ↓
  REST API (:3678)
      ↓
  Alexa webhook (:3679)
```

- **go-librespot** acts as a real Spotify Connect device. Your phone controls it natively.
- Audio streams as raw PCM → FFmpeg re-encodes to Opus → plays in Discord.
- Alexa sends intents to a local Express webhook which calls the go-librespot REST API.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| Go | 1.21+ (to build go-librespot) |
| FFmpeg | 6+ |
| Java | not needed (no Lavalink) |
| Spotify | **Premium account** required |

---

## Setup

### 1. Build go-librespot

```bash
git clone https://github.com/devgianlu/go-librespot
cd go-librespot
go build -o go-librespot ./cmd/go-librespot
cp go-librespot /path/to/discord-spotify-bot/
```

### 2. First login

```bash
cd discord-spotify-bot
./go-librespot --config_dir .
```

A browser window opens. Log in with your Spotify Premium account. A `credentials.json` is saved — future starts are automatic.

After login, open Spotify on your phone. You should see **"Discord Bot"** as an available output device. ✓

### 3. Create Discord bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. New Application → Bot tab → Reset Token → copy token
3. No privileged intents are required (Message Content and Server Members intents can remain disabled)
4. OAuth2 → URL Generator → scopes: `bot`, `applications.commands`
5. Bot permissions: `Connect`, `Speak`, `Use Slash Commands`
6. Invite bot to your server with the generated URL

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id    # from General Information tab
GUILD_ID=your_server_id                  # right-click server → Copy ID
LIBRESPOT_PATH=./go-librespot
LIBRESPOT_CONFIG_DIR=.
LIBRESPOT_API=http://localhost:3678
ALEXA_WEBHOOK_PORT=3679
```

### 5. Install dependencies & start

```bash
npm install
npm start
```

---

## Discord commands

| Command | Description |
|---------|-------------|
| `/play` | Join your voice channel and resume playback |
| `/play uri:<url>` | Load a Spotify track, album, or playlist URL |
| `/pause` | Pause playback |
| `/resume` | Resume playback |
| `/skip` | Skip to next track |
| `/prev` | Go to previous track |
| `/volume level:<0-100>` | Set volume |
| `/nowplaying` | Show current track with progress bar |
| `/leave` | Disconnect bot from voice channel |

---

## Spotify Connect (the best part)

Once the bot is running and in a voice channel, you can control everything from the **Spotify app**:

1. Open Spotify on your phone
2. Tap the device icon → select **"Discord Bot"**
3. Play any song, album, or playlist — it instantly comes out in Discord
4. Seek, queue, skip — all from your phone's native Spotify UI
5. Your friends hear it in real-time in the voice channel

---

## Alexa setup

1. Go to [developer.amazon.com/alexa/console/ask](https://developer.amazon.com/alexa/console/ask)
2. Create Skill → Custom → Provision your own
3. In the Interaction Model, paste the contents of `src/alexa/alexa-skill-model.json`
4. Set the endpoint to `https://your-domain.com/alexa`
5. Alexa **requires HTTPS** — set up Nginx + Let's Encrypt:

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx
# Get certificate
sudo certbot --nginx -d your-domain.com
# Copy nginx config
sudo cp nginx.conf.example /etc/nginx/sites-available/discord-bot
sudo ln -s /etc/nginx/sites-available/discord-bot /etc/nginx/sites-enabled/
sudo nginx -t && sudo nginx -s reload
```

Then say: **"Alexa, open Discord Music"** → **"Play"** / **"Skip"** / **"What's playing?"**

---

## Run as a service (auto-start on reboot)

```bash
sudo cp discord-spotify-bot.service /etc/systemd/system/
# Edit the path in the service file if needed
sudo systemctl daemon-reload
sudo systemctl enable discord-spotify-bot
sudo systemctl start discord-spotify-bot
sudo journalctl -u discord-spotify-bot -f   # view logs
```

---

## Limitations

| Limitation | Detail |
|------------|--------|
| **Spotify Premium** | Required — librespot won't work with free accounts |
| **One stream per account** | Spotify disconnects your phone when bot plays. Use bot as the output device. |
| **Personal use only** | Using go-librespot in a public bot violates Spotify TOS. This is for private use. |
| **TOS gray area** | go-librespot reverse-engineers Spotify's protocol. Fine for personal use. |
| **Alexa needs HTTPS** | Your server needs a domain + SSL cert for Alexa to reach the webhook. |
| **Audio latency** | ~1–2s pipeline latency (PCM → FFmpeg → Opus). Seek bar may drift slightly. |

---

## File structure

```
discord-spotify-bot/
├── src/
│   ├── index.js              ← bot entry point
│   ├── player.js             ← librespot process + Discord audio bridge
│   ├── librespot.js          ← go-librespot REST API wrapper
│   ├── commands/
│   │   ├── play.js
│   │   ├── pause.js
│   │   ├── resume.js
│   │   ├── skip.js
│   │   ├── prev.js
│   │   ├── volume.js
│   │   ├── nowplaying.js
│   │   └── leave.js
│   └── alexa/
│       ├── webhook.js        ← Express webhook for Alexa intents
│       └── alexa-skill-model.json
├── config.yml                ← go-librespot config
├── .env.example              ← environment variables template
├── nginx.conf.example        ← Nginx reverse proxy config
├── discord-spotify-bot.service ← systemd service
└── package.json
```
