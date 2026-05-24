/**
 * player.js
 * Manages the go-librespot child process and bridges its PCM output
 * into a Discord voice channel via FFmpeg → Opus.
 */

import { spawn, execSync }      from 'child_process';
import fs                       from 'fs';
import {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
} from '@discordjs/voice';
import ffmpegPath               from 'ffmpeg-static';
import { subscribeEvents }      from './librespot.js';

let librespotProcess  = null;
let ffmpegProcess     = null;
let discordPlayer     = null;
let voiceConnection   = null;
let trackChangeHandler = null;
let fifoFd            = null;
let drainProcess      = null;

// ── FIFO Draining (prevents blocking and skipping when not playing to Discord) ──

function startDraining() {
  if (drainProcess || ffmpegProcess) return;

  drainProcess = spawn(ffmpegPath, [
    '-loglevel', 'error',
    '-re',               // read at real-time speed to prevent track skipping
    '-f',  's16le',      // input format
    '-ar', '44100',      // sample rate
    '-ac', '2',          // channels
    '-i',  './spotify.fifo',
    '-f',  'null',       // discard output
    '-'
  ], { stdio: ['ignore', 'ignore', 'inherit'] });

  drainProcess.on('error', (err) => {
    console.error('[player] Drain process failed to start:', err.message);
  });

  drainProcess.on('exit', () => {
    drainProcess = null;
  });
}

function stopDraining() {
  if (drainProcess) {
    drainProcess.kill();
    drainProcess = null;
  }
}

// ── go-librespot process ─────────────────────────────────────────────────────

/**
 * Spawn the go-librespot process.
 * The pipe backend writes raw s16le PCM (44100Hz stereo) to stdout.
 * Auto-restarts on crash.
 */
export function startLibrespot() {
  if (librespotProcess) return;

  // Prepare config directory if custom path is set
  const configDir = process.env.LIBRESPOT_CONFIG_DIR || '.';
  if (configDir !== '.') {
    try {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      const targetConfig = `${configDir}/config.yml`.replace(/\\/g, '/');
      if (!fs.existsSync(targetConfig)) {
        fs.copyFileSync('./config.yml', targetConfig);
        console.log(`[player] Copied default config.yml to ${targetConfig}`);
      }
    } catch (err) {
      console.error('[player] Failed to prepare config directory:', err.message);
    }
  }

  // Ensure FIFO exists
  try {
    if (!fs.existsSync('./spotify.fifo')) {
      execSync('mkfifo ./spotify.fifo');
    }
  } catch (err) {
    console.error('[player] Failed to create FIFO:', err.message);
  }

  // Keep the write end open to prevent FFmpeg from exiting on EOF
  if (fifoFd === null) {
    try {
      fifoFd = fs.openSync('./spotify.fifo', fs.constants.O_RDWR);
    } catch (err) {
      console.error('[player] Failed to open FIFO in O_RDWR:', err.message);
    }
  }

  console.log('[librespot] starting process...');

  librespotProcess = spawn(
    process.env.LIBRESPOT_PATH || './go-librespot',
    ['--config_dir', process.env.LIBRESPOT_CONFIG_DIR || '.'],
    {
      stdio: ['ignore', 'ignore', 'inherit'], // stdout is ignored, audio routed to FIFO
    }
  );

  librespotProcess.on('error', (err) => {
    console.error('[librespot] failed to start:', err.message);
    librespotProcess = null;
  });

  librespotProcess.on('exit', (code) => {
    console.warn(`[librespot] exited (code ${code}). Restarting in 5s...`);
    librespotProcess = null;
    ffmpegProcess = null;
    stopDraining();
    setTimeout(startLibrespot, 5000);
  });

  console.log('[librespot] PID:', librespotProcess.pid);

  // If a voice connection already exists, restart the audio pipeline
  if (voiceConnection) {
    setTimeout(startAudioPipeline, 1000);
  } else {
    startDraining();
  }
}

// ── Discord voice connection ─────────────────────────────────────────────────

/**
 * Join a Discord voice channel and start the audio pipeline.
 * @param {import('discord.js').VoiceChannel} channel
 */
export async function joinChannel(channel) {
  // Destroy existing connection if joining a different channel
  if (voiceConnection) {
    voiceConnection.destroy();
    voiceConnection = null;
    discordPlayer = null;
    ffmpegProcess = null;
  }

  voiceConnection = joinVoiceChannel({
    channelId:      channel.id,
    guildId:        channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf:       false,
    debug:          true,
  });

  voiceConnection.on('debug', (msg) => {
    console.log(`[discord voice debug] ${msg}`);
  });

  voiceConnection.on('stateChange', (oldState, newState) => {
    console.log(`[discord voice state] transition from ${oldState.status} to ${newState.status}`);
  });

  try {
    await entersState(voiceConnection, VoiceConnectionStatus.Ready, 30_000);
  } catch {
    voiceConnection.destroy();
    throw new Error('Could not connect to voice channel within 30 seconds.');
  }

  voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      // Try to reconnect if briefly disconnected
      await Promise.race([
        entersState(voiceConnection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(voiceConnection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      voiceConnection.destroy();
      voiceConnection = null;
      discordPlayer?.stop();
      ffmpegProcess?.kill();
      discordPlayer = null;
      ffmpegProcess = null;
      startDraining();
    }
  });

  console.log('[discord] joined voice channel:', channel.name);
  startAudioPipeline();
  return voiceConnection;
}

/** Disconnect from voice and clean up */
export function disconnect() {
  voiceConnection?.destroy();
  discordPlayer?.stop();
  ffmpegProcess?.kill();
  voiceConnection = null;
  discordPlayer   = null;
  ffmpegProcess   = null;
  console.log('[discord] disconnected from voice');
  startDraining();
}

// ── FFmpeg audio pipeline ────────────────────────────────────────────────────

/**
 * Pipe librespot PCM → FFmpeg (s16le 44100 → Opus 48000) → discord.js AudioPlayer
 *
 * go-librespot pipe backend outputs: signed 16-bit little-endian PCM, 44100 Hz, stereo
 * Discord requires:                  Opus, 48000 Hz, stereo
 */
function startAudioPipeline() {
  if (!librespotProcess || !voiceConnection) {
    console.warn('[player] Cannot start pipeline: missing librespot or voice connection');
    return;
  }

  stopDraining();

  // Kill previous FFmpeg if any
  if (ffmpegProcess) {
    ffmpegProcess.kill();
    ffmpegProcess = null;
  }

  ffmpegProcess = spawn(ffmpegPath, [
    '-loglevel', 'error',
    '-re',               // read input at real-time rate to prevent fast draining and track skipping
    '-f',  's16le',      // input: raw PCM format
    '-ar', '44100',      // input: sample rate from librespot
    '-ac', '2',          // input: stereo
    '-i',  './spotify.fifo', // read from the named pipe (FIFO)
    '-f',  'opus',       // output: opus for Discord
    '-ar', '48000',      // output: Discord requires 48kHz
    '-ac', '2',
    '-b:a', '320k',      // bitrate
    'pipe:1',            // write to stdout
  ], { stdio: ['ignore', 'pipe', 'inherit'] });

  ffmpegProcess.on('error', (err) => {
    console.error('[ffmpeg] process error:', err.message);
  });

  ffmpegProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.warn(`[ffmpeg] exited with code ${code}, restarting pipeline in 2s...`);
      startDraining();
      setTimeout(startAudioPipeline, 2000);
    } else {
      startDraining();
    }
  });

  discordPlayer = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });

  const resource = createAudioResource(ffmpegProcess.stdout, {
    inputType: StreamType.OggOpus,
  });
  discordPlayer.play(resource);
  voiceConnection.subscribe(discordPlayer);

  discordPlayer.on(AudioPlayerStatus.Idle, () => {
    // Stream ended — go-librespot may have paused or track ended
    // This is normal; we don't restart here as librespot manages its own state
  });

  discordPlayer.on('error', (err) => {
    console.error('[discord player] error:', err.message);
    setTimeout(startAudioPipeline, 2000);
  });

  console.log('[player] audio pipeline active ✓');
}

// ── Track change events ──────────────────────────────────────────────────────

/**
 * Watch for track changes from go-librespot SSE stream.
 * @param {Function} callback - called with track metadata object
 */
export async function watchTrackChanges(callback) {
  trackChangeHandler = callback;
  await subscribeEvents((event) => {
    if (event.type === 'metadata' && event.data) {
      callback(event.data);
    }
  });
}

// ── Getters ──────────────────────────────────────────────────────────────────

export const getPlayer     = () => discordPlayer;
export const getConnection = () => voiceConnection;
export const isConnected   = () => voiceConnection !== null;
