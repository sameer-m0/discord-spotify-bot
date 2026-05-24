/**
 * Alexa webhook server
 *
 * Receives POST requests from your Alexa custom skill and maps
 * intents to go-librespot API calls.
 *
 * Setup:
 *  1. Create a custom Alexa skill at https://developer.amazon.com/alexa/console/ask
 *  2. Add intents (see alexa-skill-model.json in this directory)
 *  3. Set the endpoint to: https://your-domain.com/alexa
 *  4. Alexa REQUIRES HTTPS — use Nginx + Let's Encrypt (see README)
 */

import express from 'express';
import { play, pause, next, prev, setVolume, getStatus } from '../librespot.js';

export function createAlexaWebhook() {
  const app = express();
  app.use(express.json());

  app.post('/alexa', async (req, res) => {
    const requestType = req.body?.request?.type;
    const intentName  = req.body?.request?.intent?.name;

    // Handle session launch (e.g. "Alexa, open Discord Music")
    if (requestType === 'LaunchRequest') {
      return res.json(alexaResponse('Discord music bot is ready. You can say play, pause, skip, or adjust the volume.'));
    }

    if (requestType !== 'IntentRequest') {
      return res.json(alexaResponse('I can only handle music commands.'));
    }

    let speech = 'Done.';

    try {
      switch (intentName) {
        case 'PlayMusic':
          await play();
          speech = 'Playing.';
          break;

        case 'PauseMusic':
        case 'AMAZON.PauseIntent':
          await pause();
          speech = 'Paused.';
          break;

        case 'SkipSong':
        case 'AMAZON.NextIntent':
          await next();
          speech = 'Skipping.';
          break;

        case 'PrevSong':
        case 'AMAZON.PreviousIntent':
          await prev();
          speech = 'Going back.';
          break;

        case 'VolumeUp':
          await setVolume(80);
          speech = 'Volume up.';
          break;

        case 'VolumeDown':
          await setVolume(30);
          speech = 'Volume down.';
          break;

        case 'AMAZON.StopIntent':
        case 'AMAZON.CancelIntent':
          await pause();
          speech = 'Stopped.';
          break;

        case 'WhatIsPlaying': {
          const status = await getStatus();
          if (status?.track?.name) {
            const artists = status.track.artist?.join(' and ') || 'unknown artist';
            speech = `Now playing ${status.track.name} by ${artists}.`;
          } else {
            speech = 'Nothing is playing right now.';
          }
          break;
        }

        default:
          speech = "I didn't understand that music command.";
      }
    } catch (err) {
      console.error('[alexa] intent error:', err.message);
      speech = 'Something went wrong with the music bot.';
    }

    res.json(alexaResponse(speech));
  });

  // Health check endpoint
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  const port = parseInt(process.env.ALEXA_WEBHOOK_PORT || '3679');
  app.listen(port, () => {
    console.log(`[alexa] webhook listening on port ${port} ✓`);
  });
}

function alexaResponse(text, endSession = true) {
  return {
    version: '1.0',
    response: {
      outputSpeech: {
        type: 'PlainText',
        text,
      },
      shouldEndSession: endSession,
    },
  };
}
