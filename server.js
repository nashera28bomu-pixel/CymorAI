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

// Fixed session key — no SESSION_ID env var needed
const BOT_SESSION_KEY = 'SmileyCymorBot_Main';

const pairingSessions = new Map();

// Called by index.js to check if bot is already paired
export async function isBotPaired() {
  try {
    const { Session } = await import('./database/db.js');
    const creds = await Session.findOne({ sessionId: `${BOT_SESSION_KEY}:creds` });
    return !!creds?.data?.registered;
  } catch {
    return false;
  }
}

export { BOT_SESSION_KEY };

// ─── PAIRING ENDPOINT ────────────────────────────────────────────────
app.post('/api/pair', async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^\d{10,15}$/.test(phone.replace(/\D/g, ''))) {
    return res.json({ success: false, error: 'Invalid phone number' });
  }

  const cleanPhone = phone.replace(/\D/g, '');

  // Kill any existing pairing session for this phone
  for (const [key, session] of pairingSessions.entries()) {
    if (session.phone === cleanPhone) {
      try { session.sock?.end(); } catch {}
      if (session.keepAlive) clearInterval(session.keepAlive);
      pairingSessions.delete(key);
    }
  }

  const tempSessionId = `pair_${cleanPhone}_${Date.now()}`;

  try {
    await connectDB();

    // Use the FIXED session key so creds go straight into the right slot
    const { state, saveCreds } = await useMongoAuthState(BOT_SESSION_KEY);
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
      connectTimeoutMs: 300000,
      defaultQueryTimeoutMs: 300000,
      keepAliveIntervalMs: 5000,
    });

    sock.ev.on('creds.update', saveCreds);

    const sessionObj = {
      sock,
      phone: cleanPhone,
      connected: false,
      pairingCode: null,
      error: null,
      keepAlive: null,
    };
    pairingSessions.set(tempSessionId, sessionObj);

    let codeRequested = false;

    sock.ev.on('connection.update', async (update) => {
      const { connection } = update;

      // Request pairing code once socket is up
      if (!codeRequested && !sock.authState.creds.registered) {
        codeRequested = true;
        try {
          await new Promise(r => setTimeout(r, 3000));
          let code = await sock.requestPairingCode(cleanPhone);
          code = code?.match(/.{1,4}/g)?.join('-') || code;
          sessionObj.pairingCode = code;
          console.log(`✅ Code for ${cleanPhone}: ${code}`);

          // Keep-alive: send presence ping every 8s to prevent TCP timeout
          sessionObj.keepAlive = setInterval(async () => {
            if (sessionObj.connected) {
              clearInterval(sessionObj.keepAlive);
              return;
            }
            try {
              await sock.sendPresenceUpdate('available');
            } catch {
              clearInterval(sessionObj.keepAlive);
            }
          }, 8000);

        } catch (e) {
          console.error('Code error:', e.message);
          sessionObj.error = 'Failed to get pairing code. Make sure this number is on WhatsApp.';
        }
      }

      if (connection === 'open') {
        console.log(`✅ Bot paired successfully for ${cleanPhone}`);
        sessionObj.connected = true;
        if (sessionObj.keepAlive) clearInterval(sessionObj.keepAlive);

        // Save creds one final time to lock in the registered state
        await saveCreds();

        // Notify the user on WhatsApp
        try {
          const welcomeMsg = `🎉 *Smiley Cymor Bot — Successfully Paired!*

╔══════════════════════╗
║   ✅ BOT IS READY!   ║
╚══════════════════════╝

Your bot is now connected and saved!
No session ID needed — it auto-connects on every restart. 🚀

━━━━━━━━━━━━━━━━━━━━━━━
🔥 *WHAT'S ACTIVE:*
━━━━━━━━━━━━━━━━━━━━━━━
✅ 90+ Commands
✅ AI Chat (Groq)
✅ Economy System  
✅ Games & Fun
✅ Media Downloads
✅ Group Management
✅ Privacy Tools (.vv, ghost)
✅ Deleted Msg Recovery
✅ Auto Status View/Like

━━━━━━━━━━━━━━━━━━━━━━━

Type *.menu* to see all commands!

👑 Owner: Legendary Smiley Cymor
📞 Support: wa.me/254784074568
> 🤖 Powered by Cymor Tech Services`;

          await sock.sendMessage(`${cleanPhone}@s.whatsapp.net`, { text: welcomeMsg });
        } catch (e) {
          console.error('Welcome DM error:', e.message);
        }

        // Notify owner too if different number
        if (cleanPhone !== config.ownerNumber) {
          try {
            await sock.sendMessage(`${config.ownerNumber}@s.whatsapp.net`, {
              text: `📱 *New Bot Pairing!*\n\nNumber: +${cleanPhone}\nTime: ${new Date().toLocaleString()}\n\n> 🤖 Smiley Cymor Bot`,
            });
          } catch {}
        }
      }

      if (connection === 'close') {
        if (sessionObj.keepAlive) clearInterval(sessionObj.keepAlive);
        if (!sessionObj.connected) {
          console.log(`Pairing socket closed before connecting for ${cleanPhone}`);
        }
      }
    });

    // Wait up to 15s for pairing code
    let waited = 0;
    while (waited < 15000) {
      await new Promise(r => setTimeout(r, 500));
      waited += 500;
      if (sessionObj.pairingCode) {
        return res.json({ success: true, pairingCode: sessionObj.pairingCode });
      }
      if (sessionObj.error) {
        return res.json({ success: false, error: sessionObj.error });
      }
    }

    return res.json({ success: false, error: 'Timed out. Please try again.' });

  } catch (err) {
    console.error('Pair error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

// Check if bot is connected (polling from pair.html)
app.get('/api/pairstatus', (req, res) => {
  const phone = req.query.phone;
  if (!phone) return res.json({ connected: false });
  for (const session of pairingSessions.values()) {
    if (session.phone === phone && session.connected) {
      return res.json({ connected: true });
    }
  }
  res.json({ connected: false });
});

// Check if bot is already paired (on page load)
app.get('/api/botready', async (req, res) => {
  try {
    const { Session } = await import('./database/db.js');
    const creds = await Session.findOne({ sessionId: `${BOT_SESSION_KEY}:creds` });
    res.json({ ready: !!creds?.data?.registered });
  } catch {
    res.json({ ready: false });
  }
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
