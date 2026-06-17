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
      // Real Ubuntu Chrome fingerprint — critical for pairing to work
      browser: ['Ubuntu', 'Chrome', '120.0.6099.71'],
      printQRInTerminal: false,
      connectTimeoutMs: 120000,
      defaultQueryTimeoutMs: 120000,
      keepAliveIntervalMs: 10000, // ping every 10s so socket stays alive while user enters code
      retryRequestDelayMs: 2000,
    });

    sock.ev.on('creds.update', saveCreds);

    // Store session immediately
    pairingSessions.set(sessionId, {
      sock,
      phone: cleanPhone,
      connected: false,
      pairingCode: null,
      error: null,
    });

    // Request pairing code once socket fires connection update
    let codeRequested = false;
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      // Fire once — when socket is up and creds not yet registered
      if (!codeRequested && !sock.authState.creds.registered) {
        codeRequested = true;
        try {
          // Let the WS fully stabilise before requesting
          await new Promise(r => setTimeout(r, 4000));
          let code = await sock.requestPairingCode(cleanPhone);
          // Format as XXXX-XXXX
          code = code?.match(/.{1,4}/g)?.join('-') || code;
          const session = pairingSessions.get(sessionId);
          if (session) session.pairingCode = code;
          console.log(`✅ Pairing code generated for ${cleanPhone}: ${code}`);
        } catch (e) {
          console.error('Pairing code error:', e.message);
          const session = pairingSessions.get(sessionId);
          if (session) session.error = e.message;
        }
      }

      if (connection === 'open') {
        console.log(`✅ Session connected: ${sessionId}`);
        const session = pairingSessions.get(sessionId);
        if (session) {
          session.connected = true;
          // DM the session ID to the user
          const msg = `🎉 *Smiley Cymor Bot — Session Ready!*

╔══════════════════════╗
║   🔐 YOUR SESSION ID   ║
╚══════════════════════╝

*Copy this exactly:*
\`\`\`
${sessionId}
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━
📋 *DEPLOY STEPS:*
━━━━━━━━━━━━━━━━━━━━━━━
1️⃣ Copy the Session ID above
2️⃣ Go to your Render dashboard
3️⃣ Add env var: SESSION_ID = (paste)
4️⃣ Save & redeploy
5️⃣ Bot comes online! 🚀

━━━━━━━━━━━━━━━━━━━━━━━
🌐 *Deploy Platforms:*
▸ render.com  ▸ koyeb.com
▸ heroku.com  ▸ railway.app

📞 Support: wa.me/254784074568
> 🤖 Powered by Cymor Tech Services`;

          try {
            await sock.sendMessage(`${cleanPhone}@s.whatsapp.net`, { text: msg });
          } catch (e) {
            console.error('Could not send session DM:', e.message);
          }
        }
      }

      if (connection === 'close') {
        console.log('Pairing socket closed for', sessionId);
        // Don't delete session immediately — let status endpoint report connected
      }
    });

    // Wait up to 15s for pairing code
    let waited = 0;
    while (waited < 15000) {
      await new Promise(r => setTimeout(r, 500));
      waited += 500;
      const session = pairingSessions.get(sessionId);
      if (session?.pairingCode) {
        return res.json({ success: true, pairingCode: session.pairingCode, sessionId });
      }
      if (session?.error) {
        return res.json({ success: false, error: 'Could not generate pairing code. Make sure this number is registered on WhatsApp and try again.' });
      }
    }

    return res.json({ success: false, error: 'Timed out. Please try again.' });

  } catch (err) {
    console.error('Pair endpoint error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// Check if session is connected
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
  await User.findOneAndUpdate({ jid: req.body.jid }, { role: 'banned' });
  res.json({ success: true });
});

app.post('/api/admin/unban', adminAuth, async (req, res) => {
  await User.findOneAndUpdate({ jid: req.body.jid }, { role: 'user' });
  res.json({ success: true });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/pair.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

const PORT = config.port || 3000;
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🌐 Web server on port ${PORT}`);
    console.log(`🔗 Pair: http://localhost:${PORT}`);
    console.log(`🔧 Admin: http://localhost:${PORT}/admin`);
  });
});

export default app;
