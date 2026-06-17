import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { connectDB, User, Subscriber, BotStats, getTodayStats } from './database/db.js';
import { useMongoAuthState } from './lib/session.js';
import makeWASocket, {
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import pino from 'pino';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const logger = pino({ level: 'silent' });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pairingSessions = new Map();

// ─── PAIRING ENDPOINT ────────────────────────────────────────────────
app.post('/api/pair', async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) {
    return res.json({ success: false, error: 'Invalid phone number' });
  }

  const cleanPhone = phone.replace(/\D/g, '');
  const sessionId = `SmileyCymor_${cleanPhone}_${Date.now()}`;

  try {
    await connectDB();
    const { state, saveCreds } = await useMongoAuthState(sessionId);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: ['Ubuntu', 'Chrome', '120.0.6099.71'],
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
    });

    sock.ev.on('creds.update', saveCreds);

    // Store session early
    pairingSessions.set(sessionId, { sock, saveCreds, state, phone: cleanPhone, connected: false });

    let pairingCode = null;
    let codeRequested = false;

    // Request pairing code ONLY when socket signals it's ready (not registered)
    sock.ev.on('connection.update', async (update) => {
      const { connection, isNewLogin, qr } = update;

      // Socket is open and waiting — request code now
      if (!codeRequested && !sock.authState.creds.registered) {
        codeRequested = true;
        try {
          // Small delay to ensure WS handshake is complete
          await new Promise(r => setTimeout(r, 3000));
          pairingCode = await sock.requestPairingCode(cleanPhone);
          pairingCode = pairingCode?.match(/.{1,4}/g)?.join('-') || pairingCode;
          // Store code so status endpoint can return it
          const session = pairingSessions.get(sessionId);
          if (session) session.pairingCode = pairingCode;
        } catch (e) {
          const session = pairingSessions.get(sessionId);
          if (session) session.error = e.message;
        }
      }

      if (connection === 'open') {
        const session = pairingSessions.get(sessionId);
        if (session) {
          session.connected = true;
          const sessionMsg = `🎉 *Smiley Cymor Bot - Session Connected!*

╔══════════════════════╗
║  🔐 YOUR SESSION ID  ║
╚══════════════════════╝

\`\`\`
${sessionId}
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━
📋 *HOW TO DEPLOY:*
━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ Copy your Session ID above
2️⃣ Fork the bot repo on GitHub
3️⃣ Deploy to Render/Koyeb/Heroku
4️⃣ Add SESSION_ID env variable
5️⃣ Add MONGO_URI env variable
6️⃣ Deploy and enjoy! 🚀

━━━━━━━━━━━━━━━━━━━━━━━
🌐 *Supported Platforms:*
▸ Render (render.com)
▸ Koyeb (koyeb.com)
▸ Heroku (heroku.com)
▸ Railway (railway.app)
▸ VPS (any Linux server)
━━━━━━━━━━━━━━━━━━━━━━━

📞 Support: wa.me/254784074568

> 🤖 Powered by Cymor Tech Services`;

          await sock.sendMessage(`${cleanPhone}@s.whatsapp.net`, { text: sessionMsg });
        }
      }

      if (connection === 'close') {
        pairingSessions.delete(sessionId);
      }
    });

    // Wait up to 12 seconds for the pairing code to be generated
    let waited = 0;
    while (!pairingCode && waited < 12000) {
      await new Promise(r => setTimeout(r, 500));
      waited += 500;
      // Check if session stored a code meanwhile
      const session = pairingSessions.get(sessionId);
      if (session?.pairingCode) pairingCode = session.pairingCode;
      if (session?.error) {
        return res.json({ success: false, error: 'Could not generate pairing code. Make sure the number is on WhatsApp.' });
      }
    }

    if (!pairingCode) {
      return res.json({ success: false, error: 'Timed out getting pairing code. Try again.' });
    }

    res.json({ success: true, pairingCode, sessionId });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Check pairing status
app.get('/api/status/:sessionId', (req, res) => {
  const session = pairingSessions.get(req.params.sessionId);
  res.json({ connected: session?.connected || false });
});

// ─── ADMIN API ───────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const pass = req.headers['x-admin-password'] || req.query.password;
  if (pass !== config.adminPassword) return res.json({ error: 'Unauthorized' });
  next();
}

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const premiumUsers = await User.countDocuments({ role: 'premium' });
    const vipUsers = await User.countDocuments({ role: 'vip' });
    const bannedUsers = await User.countDocuments({ role: 'banned' });
    const subscribers = await Subscriber.countDocuments();
    const today = await getTodayStats();
    const recent7 = await BotStats.find().sort({ date: -1 }).limit(7);
    res.json({ totalUsers, premiumUsers, vipUsers, bannedUsers, subscribers, today, recent7 });
  } catch (err) {
    res.json({ error: err.message });
  }
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  const users = await User.find({}).sort({ joinedAt: -1 }).limit(50);
  res.json(users);
});

app.post('/api/admin/ban', adminAuth, async (req, res) => {
  const { jid } = req.body;
  await User.findOneAndUpdate({ jid }, { role: 'banned' });
  res.json({ success: true });
});

app.post('/api/admin/unban', adminAuth, async (req, res) => {
  const { jid } = req.body;
  await User.findOneAndUpdate({ jid }, { role: 'user' });
  res.json({ success: true });
});

// Serve pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/pair.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

const PORT = config.port || 3000;
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🌐 Web server running on port ${PORT}`);
    console.log(`🔗 Pair page: http://localhost:${PORT}`);
    console.log(`🔧 Admin: http://localhost:${PORT}/admin`);
  });
});

export default app;
