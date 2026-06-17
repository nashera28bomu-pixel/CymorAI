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

let sock = null;
let retryCount = 0;
const MAX_RETRIES = 15;

async function isRegistered() {
  try {
    const creds = await Session.findOne({ sessionId: `${BOT_SESSION_KEY}:creds` });
    return !!creds?.data?.registered;
  } catch {
    return false;
  }
}

async function startBot() {
  await connectDB();

  // Check if bot has been paired yet
  const registered = await isRegistered();

  if (!registered) {
    console.log('⚠️  Bot not paired yet.');
    console.log(`🌐 Open your Render URL to pair your number.`);
    console.log('🔄 Checking again in 30 seconds...');
    // Poll every 30s until paired, then auto-start
    setTimeout(startBot, 30000);
    return;
  }

  console.log(`\n🤖 Starting ${config.botName}...`);

  const { state, saveCreds } = await useMongoAuthState(BOT_SESSION_KEY);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`📦 Baileys v${version.join('.')}`);

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
      console.log(`❌ Disconnected. Code: ${statusCode}`);

      // Logged out or banned — stop
      if (statusCode === DisconnectReason.loggedOut || statusCode === 403) {
        console.log('🔒 Session ended. Re-pair via the web URL.');
        // Clear stored creds so pairing page works again
        try {
          await Session.deleteMany({ sessionId: { $regex: `^${BOT_SESSION_KEY}` } });
          console.log('🗑️  Cleared old session. Ready to re-pair.');
        } catch {}
        retryCount = 0;
        // Restart polling loop
        setTimeout(startBot, 5000);
        return;
      }

      // Retry with exponential backoff
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        const delay = Math.min(retryCount * 5000, 60000);
        console.log(`🔄 Reconnecting in ${delay / 1000}s... (${retryCount}/${MAX_RETRIES})`);
        setTimeout(startBot, delay);
      } else {
        console.log('❌ Max retries reached. Will try again in 5 minutes.');
        retryCount = 0;
        setTimeout(startBot, 300000);
      }
    }

    if (connection === 'open') {
      retryCount = 0;
      const botNumber = sock.user?.id?.split(':')[0] || 'Unknown';
      console.log(`\n✅ ${config.botName} Connected!`);
      console.log(`📱 Number: +${botNumber}`);
      console.log(`👑 Owner: +${config.ownerNumber}`);
      console.log(`🚀 Ready! Prefixes: ${config.prefixes.join(' ')}\n`);

      try {
        await sock.sendMessage(`${config.ownerNumber}@s.whatsapp.net`, {
          text: `🎉 *${config.botName} is Now Online!* 🎉

╔══════════════════════╗
║   🤖 SYSTEM ONLINE 🤖   ║
╚══════════════════════╝

✅ Connected as: +${botNumber}
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
> 🤖 Powered by Cymor Tech Services`,
        });
      } catch {}
    }
  });

  // Messages
  sock.ev.on('messages.upsert', async (m) => {
    for (const msg of m.messages || []) {
      cacheMessage(msg);
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
