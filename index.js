import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
} from '@whiskeysockets/baileys';

import { Boom } from '@hapi/boom';
import pino from 'pino';

import { connectDB, Session } from './database/db.js';
import { useMongoAuthState } from './lib/session.js';
import { config } from './config.js';

import {
  handleMessage,
  handleGroupParticipant,
  handleRevoke,
  cacheMessage,
} from './handler.js';

const logger = pino({ level: 'silent' });

const BOT_SESSION_KEY = 'SmileyCymorBot_Main';
const MAX_RETRIES = 15;

let sock = null;
let retryCount = 0;
let isStarting = false;

/**
 * Check if bot session exists
 */
async function isRegistered() {
  try {
    const creds = await Session.findOne({
      sessionId: `${BOT_SESSION_KEY}:creds`,
    }).lean();

    const registered =
      !!creds?.data?.registered ||
      !!creds?.data?.me;

    console.log('REGISTERED CHECK:', registered);

    return registered;
  } catch (err) {
    console.error('Registration check failed:', err.message);
    return false;
  }
}

/**
 * Start bot
 */
async function startBot() {
  if (isStarting) {
    console.log('⚠️ Bot startup already in progress');
    return;
  }

  isStarting = true;

  try {
    await connectDB();

    const registered = await isRegistered();

    if (!registered) {
      console.log('\n⚠️ Bot not paired yet');
      console.log('🌐 Open your Render URL and pair');
      console.log('🔄 Checking again in 30 seconds...\n');

      isStarting = false;

      setTimeout(() => {
        startBot();
      }, 30000);

      return;
    }

    console.log(`\n🤖 Starting ${config.botName}...\n`);

    const { state, saveCreds } =
      await useMongoAuthState(BOT_SESSION_KEY);

    const { version } =
      await fetchLatestBaileysVersion();

    console.log(
      `📦 Baileys v${version.join('.')}`
    );

    sock = makeWASocket({
      version,

      logger,

      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(
          state.keys,
          logger
        ),
      },

      browser: [
        'Ubuntu',
        'Chrome',
        '120.0.6099.71',
      ],

      printQRInTerminal: false,

      syncFullHistory: false,

      generateHighQualityLinkPreview: true,

      connectTimeoutMs: 60000,

      defaultQueryTimeoutMs: 60000,

      keepAliveIntervalMs: 30000,

      getMessage: async () => ({
        conversation: '',
      }),
    });

    sock.ev.on('creds.update', saveCreds);

    /**
     * Connection updates
     */
    sock.ev.on(
      'connection.update',
      async (update) => {
        console.log(
          'CONNECTION UPDATE:',
          JSON.stringify(update, null, 2)
        );

        const {
          connection,
          lastDisconnect,
        } = update;

        if (connection === 'open') {
          retryCount = 0;

          const botNumber =
            sock.user?.id?.split(':')[0] ||
            'Unknown';

          console.log(
            `\n✅ ${config.botName} Connected`
          );

          console.log(
            `📱 Number: +${botNumber}`
          );

          console.log(
            `👑 Owner: ${config.ownerNumber}`
          );

          console.log('🚀 Bot Ready\n');

          try {
            const ownerJid =
              config.ownerNumber.includes(
                '@s.whatsapp.net'
              )
                ? config.ownerNumber
                : `${config.ownerNumber}@s.whatsapp.net`;

            await sock.sendMessage(ownerJid, {
              text:
                `🎉 ${config.botName} is online!\n\n` +
                `📱 +${botNumber}\n` +
                `⚡ Connected successfully`,
            });
          } catch (err) {
            console.error(
              'Owner notification failed:',
              err.message
            );
          }

          return;
        }

        if (connection === 'close') {
          const statusCode =
            new Boom(
              lastDisconnect?.error
            ).output?.statusCode;

          console.log(
            `❌ Disconnected. Code: ${statusCode}`
          );

          console.log(
            'Disconnect Reason:',
            lastDisconnect?.error
          );

          /**
           * Logged out
           */
          if (
            statusCode ===
              DisconnectReason.loggedOut ||
            statusCode === 403
          ) {
            console.log(
              '🔒 Session logged out'
            );

            try {
              await Session.deleteMany({
                sessionId: {
                  $regex:
                    `^${BOT_SESSION_KEY}`,
                },
              });

              console.log(
                '🗑️ Old session removed'
              );
            } catch (err) {
              console.error(
                err.message
              );
            }

            retryCount = 0;

            setTimeout(
              startBot,
              5000
            );

            return;
          }

          /**
           * Reconnect
           */
          if (
            retryCount <
            MAX_RETRIES
          ) {
            retryCount++;

            const delay = Math.min(
              retryCount * 5000,
              60000
            );

            console.log(
              `🔄 Reconnecting in ${
                delay / 1000
              }s (${retryCount}/${MAX_RETRIES})`
            );

            setTimeout(
              startBot,
              delay
            );
          } else {
            console.log(
              '❌ Max retries reached'
            );

            retryCount = 0;

            setTimeout(
              startBot,
              300000
            );
          }
        }
      }
    );

    /**
     * Incoming messages
     */
    sock.ev.on(
      'messages.upsert',
      async (m) => {
        try {
          for (
            const msg of
            m.messages || []
          ) {
            cacheMessage(msg);

            if (
              msg.key.remoteJid ===
              'status@broadcast'
            ) {
              try {
                await sock.readMessages([
                  msg.key,
                ]);
              } catch {}
            }
          }

          if (
            m.type === 'notify'
          ) {
            await handleMessage(
              sock,
              m
            );
          }
        } catch (err) {
          console.error(
            'Message handler:',
            err.message
          );
        }
      }
    );

    /**
     * Deleted messages
     */
    sock.ev.on(
      'messages.update',
      async (updates) => {
        try {
          for (
            const update of updates
          ) {
            if (
              update.update
                ?.messageStubType ===
              proto.WebMessageInfo
                .StubType.REVOKE
            ) {
              await handleRevoke(
                sock,
                {
                  keys: [
                    update.key,
                  ],
                }
              );
            }
          }
        } catch (err) {
          console.error(
            err.message
          );
        }
      }
    );

    /**
     * Group events
     */
    sock.ev.on(
      'group-participants.update',
      async (event) => {
        try {
          await handleGroupParticipant(
            sock,
            event
          );
        } catch (err) {
          console.error(
            err.message
          );
        }
      }
    );
  } catch (err) {
    console.error(
      'Bot startup failed:',
      err.message
    );
  } finally {
    isStarting = false;
  }
}

process.on(
  'uncaughtException',
  (err) => {
    console.error(
      'Uncaught Exception:',
      err
    );
  }
);

process.on(
  'unhandledRejection',
  (err) => {
    console.error(
      'Unhandled Rejection:',
      err
    );
  }
);

startBot();

export { startBot };
