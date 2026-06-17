import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { connectDB } from './database/db.js';
import { useMongoAuthState } from './lib/session.js';
import { config } from './config.js';
import {
  handleMessage,
  handleGroupParticipant,
  handleRevoke,
  cacheMessage,
} from './handler.js';

const logger = pino({ level: 'silent' });

let sock = null;
let retryCount = 0;
const MAX_RETRIES = 10;

async function startBot() {
  await connectDB();

  const sessionId = config.sessionId;

  // If no SESSION_ID is set, don't start the bot — wait for pairing via web
  if (!sessionId) {
    console.log('⚠️  No SESSION_ID set. Bot is in pairing mode.');
    console.log('🌐 Open the web URL and pair your number first.');
    console.log('📋 Then add SESSION_ID to your environment variables and redeploy.');
    return;
  }

  const { state, saveCreds } = await useMongoAuthState(sessionId);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`\n🤖 Starting ${config.botName}...`);
  console.log(`📦 Baileys version: ${version.join('.')}`);

  sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: ['Ubuntu', 'Chrome', '120.0.6099.71'],
    printQRInTerminal: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    getMessage: async () => ({ conversation: '' }),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log(`❌ Disconnected. Reason: ${statusCode}`);

      // 401 = logged out, 403 = banned — do not retry
      if (statusCode === DisconnectReason.loggedOut || statusCode === 403) {
        console.log('🔒 Logged out / banned. Clear SESSION_ID and re-pair.');
        retryCount = 0;
        process.exit(0);
      }

      // 408 = connection timeout during initial pairing — do not loop
      if (statusCode === 408 && !state.creds.registered) {
        console.log('⏳ Pairing timed out. Please re-pair via the web URL.');
        return;
      }

      // All other disconnects — retry with backoff
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        const delay = Math.min(retryCount * 5000, 30000);
        console.log(`🔄 Reconnecting in ${delay / 1000}s... (${retryCount}/${MAX_RETRIES})`);
        setTimeout(startBot, delay);
      } else {
        console.log('❌ Max retries reached. Exiting.');
        process.exit(1);
      }
    }

    if (connection === 'open') {
      retryCount = 0;
      const botNumber = sock.user.id.split(':')[0];
      console.log(`\n✅ ${config.botName} Connected!`);
      console.log(`📱 Bot Number: +${botNumber}`);
      console.log(`👑 Owner: ${config.ownerNumber}`);
      console.log(`\n🚀 Ready! Prefixes: ${config.prefixes.join(' ')}\n`);

      // Send welcome message to owner
      const welcomeMsg = `🎉 *${config.botName} is Now Online!* 🎉

╔══════════════════════╗
║   🤖 SYSTEM ONLINE 🤖   ║
╚══════════════════════╝

✅ Bot successfully connected!
📱 Number: +${botNumber}
🧠 AI: Groq (LLaMA3-8B)
💾 Database: MongoDB Atlas
⚡ Status: Fully Operational

━━━━━━━━━━━━━━━━━━━━━━━
🔥 *FEATURES ACTIVE:*
━━━━━━━━━━━━━━━━━━━━━━━
✅ 90+ Commands
✅ AI Chat (Groq)
✅ Economy System
✅ Games & Fun
✅ Media Downloads
✅ Group Management
✅ Privacy Tools
✅ Auto Status View/Like
✅ Deleted Msg Recovery
✅ View Once Saver (.vv)

━━━━━━━━━━━━━━━━━━━━━━━

Type *.menu* to see all commands!

> 👑 Owner: Legendary Smiley Cymor
> 🤖 Powered by Cymor Tech Services`;

      try {
        await sock.sendMessage(`${config.ownerNumber}@s.whatsapp.net`, { text: welcomeMsg });
      } catch {}
    }
  });

  // Messages
  sock.ev.on('messages.upsert', async (m) => {
    for (const msg of m.messages || []) {
      cacheMessage(msg);
      // Auto view status
      if (msg.key.remoteJid === 'status@broadcast') {
        try { await sock.readMessages([msg.key]); } catch {}
      }
    }
    if (m.type === 'notify') {
      await handleMessage(sock, m);
    }
  });

  // Deleted messages
  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      if (update.update?.messageStubType === proto.WebMessageInfo.StubType.REVOKE) {
        await handleRevoke(sock, { keys: [update.key] });
      }
    }
  });

  // Group events
  sock.ev.on('group-participants.update', async (event) => {
    await handleGroupParticipant(sock, event);
  });

  return sock;
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err?.message || err);
});

startBot();

export { startBot };
