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
      connectTimeoutMs: 300000,       // 5 minutes
      defaultQueryTimeoutMs: 300000,  // 5 minutes
      keepAliveIntervalMs: 5000,      // ping every 5 seconds
      retryRequestDelayMs: 1000,
    });

    sock.ev.on('creds.update', saveCreds);

    pairingSessions.set(sessionId, {
      sock,
      phone: cleanPhone,
      connected: false,
      pairingCode: null,
      error: null,
      keepAliveTimer: null,
    });

    let codeRequested = false;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      // Request code once on first update when not yet registered
      if (!codeRequested && !sock.authState.creds.registered) {
        codeRequested = true;
        try {
          await new Promise(r => setTimeout(r, 4000));
          let code = await sock.requestPairingCode(cleanPhone);
          code = code?.match(/.{1,4}/g)?.join('-') || code;
          const session = pairingSessions.get(sessionId);
          if (session) {
            session.pairingCode = code;

            // START KEEP-ALIVE LOOP — sends a presence ping every 8s
            // so Render doesn't kill the idle socket while user types code
            session.keepAliveTimer = setInterval(async () => {
              try {
                if (!session.connected) {
                  await sock.sendPresenceUpdate('available');
                } else {
                  clearInterval(session.keepAliveTimer);
                }
              } catch {
                clearInterval(session.keepAliveTimer);
              }
            }, 8000);
          }
          console.log(`✅ Code for ${cleanPhone}: ${code}`);
        } catch (e) {
          console.error('Code error:', e.message);
          const session = pairingSessions.get(sessionId);
          if (session) session.error = e.message;
        }
      }

      if (connection === 'open') {
        console.log(`✅ Paired: ${sessionId}`);
        const session = pairingSessions.get(sessionId);
        if (session) {
          session.connected = true;
          // Stop keep-alive loop
          if (session.keepAliveTimer) clearInterval(session.keepAliveTimer);

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
3️⃣ Environment → Add: SESSION_ID
4️⃣ Paste the session ID as value
5️⃣ Save & redeploy — bot goes live! 🚀

━━━━━━━━━━━━━━━━━━━━━━━
🌐 *Platforms Supported:*
▸ render.com  ▸ koyeb.com
▸ heroku.com  ▸ railway.app

📞 Support: wa.me/254784074568
> 🤖 Powered by Cymor Tech Services`;

          try {
            await sock.sendMessage(`${cleanPhone}@s.whatsapp.net`, { text: msg });
          } catch (e) {
            console.error('DM error:', e.message);
          }
        }
      }

      if (connection === 'close') {
        const session = pairingSessions.get(sessionId);
        if (session?.keepAliveTimer) clearInterval(session.keepAliveTimer);
        console.log('Pairing socket closed:', sessionId);
      }
    });

    // Poll for pairing code up to 15s then respond
    let waited = 0;
    while (waited < 15000) {
      await new Promise(r => setTimeout(r, 500));
      waited += 500;
      const session = pairingSessions.get(sessionId);
      if (session?.pairingCode) {
        return res.json({ success: true, pairingCode: session.pairingCode, sessionId });
      }
      if (session?.error) {
        return res.json({ success: false, error: 'Could not generate pairing code. Make sure this number is on WhatsApp and try again.' });
      }
    }

    return res.json({ success: false, error: 'Timed out generating code. Please try again.' });

  } catch (err) {
    console.error('Pair error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// Status check
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
