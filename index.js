import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './database/db.js';
import { useMongoAuthState } from './lib/session.js';
import { config } from './config.js';
import {
  handleMessage,
  handleGroupParticipant,
  handleStatusUpdate,
  handleRevoke,
  cacheMessage,
} from './handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Suppress noisy logs
const logger = pino({ level: 'silent' });

let sock = null;
let retryCount = 0;
const MAX_RETRIES = 10;

// Export sock for use in web server
export { sock };

async function startBot() {
  await connectDB();

  const sessionId = config.sessionId || 'SmileyCymor';

  // Use MongoDB auth state for persistence across restarts
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
    // Browser emulation - appear as Ubuntu Chrome for real pairing code
    browser: ['Smiley Cymor Bot', 'Chrome', '120.0.0'],
    printQRInTerminal: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
    getMessage: async (key) => {
      return { conversation: '' };
    },
  });

  // Handle pairing code request for web server
  if (!sock.authState.creds.registered) {
    // Web server will call this
    global.sockInstance = sock;
  } else {
    global.sockInstance = sock;
  }

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);

  // Connection events
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr, isNewLogin } = update;

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log(`❌ Disconnected. Reason: ${reason}`);

      if (reason === DisconnectReason.loggedOut) {
        console.log('🔒 Logged out. Please re-pair.');
        retryCount = 0;
        process.exit(0);
      } else if (retryCount < MAX_RETRIES) {
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
      console.log(`🌐 Web: http://localhost:${config.port}`);
      console.log(`\n🚀 Ready! Type ${config.prefixes[0]}menu to see all commands\n`);

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
✅ View Once Saver

━━━━━━━━━━━━━━━━━━━━━━━

Type *.menu* to see all commands!

> 👑 Owner: Legendary Smiley Cymor
> 🤖 Powered by Cymor Tech Services`;

      await sock.sendMessage(`${config.ownerNumber}@s.whatsapp.net`, { text: welcomeMsg });
    }
  });

  // Messages
  sock.ev.on('messages.upsert', async (m) => {
    // Cache all incoming messages for deleted msg recovery
    for (const msg of m.messages || []) {
      cacheMessage(msg);
    }
    if (m.type === 'notify') {
      await handleMessage(sock, m);
    }
  });

  // Message deletions (revoke)
  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      if (update.update?.messageStubType === proto.WebMessageInfo.StubType.REVOKE) {
        await handleRevoke(sock, { keys: [update.key] });
      }
    }
  });

  // Group participant updates (welcome message)
  sock.ev.on('group-participants.update', async (event) => {
    await handleGroupParticipant(sock, event);
  });

  // Status updates (auto view/like)
  sock.ev.on('messages.upsert', async (m) => {
    for (const msg of m.messages || []) {
      if (msg.key.remoteJid === 'status@broadcast') {
        await handleStatusUpdate(sock, {
          id: msg.key.id,
          type: 'status',
          participant: msg.key.participant,
        });
      }
    }
  });

  return sock;
}

// Anti-crash
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err?.message || err);
});

// Start
startBot();

export { startBot };
