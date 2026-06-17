# 🤖 Smiley Cymor Bot v2.0

> **The most powerful WhatsApp MD bot — built by Legendary Smiley Cymor**
> Powered by Cymor Tech Services

---

## ✨ Features

- 90+ commands across 8 categories
- 🤖 Groq AI (LLaMA3) with per-user memory
- 💰 Economy system (coins, levels, shop)
- 🎮 Games (trivia, hangman, slots, casino, RPS)
- 🎵 Media downloads (TikTok, Instagram, audio)
- 👥 Full group management
- 👁️ View once saver (.vv)
- 🗑️ Deleted message recovery
- 👻 Auto view/like status, auto blue tick, ghost mode
- 📢 Owner broadcast to all users
- 🔐 MongoDB session persistence (survives restarts)
- 🌐 Beautiful pair.html + admin dashboard

---

## 🚀 Deploy in 5 Minutes

### Step 1 — Fork & Clone
```bash
git clone https://github.com/YOUR_USERNAME/smiley-cymor-bot
cd smiley-cymor-bot
npm install
```

### Step 2 — Get Your Session ID
1. Deploy the web server: `npm run web`
2. Open `http://localhost:3000`
3. Enter your WhatsApp number
4. Enter the pairing code in WhatsApp → Settings → Linked Devices
5. Your Session ID will arrive in your WhatsApp DM

### Step 3 — Set Environment Variables
Copy `.env.example` to `.env` and fill in:

```env
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/cymor-bot
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxx
OWNER_NUMBER=254XXXXXXXXX
SUPPORT_NUMBER=254784074568
SESSION_ID=session_254XXXXXXXXX_xxxxxxxxx
ADMIN_PASSWORD=YourAdminPassword
PORT=3000
```

### Step 4 — Deploy to Render (Free)
1. Push code to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your GitHub repo
4. Set **Start Command**: `node index.js`
5. Add all environment variables
6. Deploy!

### Step 5 — Deploy to Koyeb (Free)
1. Go to [koyeb.com](https://koyeb.com) → Create App
2. Select GitHub repo
3. Set start command: `node index.js`
4. Add environment variables
5. Deploy!

---

## 📁 Project Structure

```
smiley-cymor-bot/
├── index.js              # Main bot entry + Baileys connection
├── server.js             # Express web server (pair + admin)
├── handler.js            # Central command router
├── config.js             # Bot configuration
├── package.json
├── .env.example
├── commands/
│   ├── ai.js             # AI commands (ask, roast, story...)
│   ├── games.js          # Games (trivia, hangman, slots...)
│   ├── economy.js        # Coins, daily, shop, leaderboard
│   ├── media.js          # Sticker, vv, TikTok, IG, play
│   ├── utility.js        # Weather, calc, wiki, remind...
│   ├── group.js          # Kick, mute, antilink, tagall...
│   ├── privacy.js        # Autoview, ghost, faketype, recovered
│   └── owner.js          # Broadcast, ban, stats, give...
├── lib/
│   ├── groq.js           # Groq AI integration
│   ├── sender.js         # Message sending helpers + menu builder
│   ├── session.js        # MongoDB Baileys auth persistence
│   └── utils.js          # Shared utilities
├── database/
│   └── db.js             # MongoDB models & helpers
└── public/
    ├── logo.png           # Bot logo
    ├── pair.html          # Pairing page
    └── admin.html         # Admin dashboard
```

---

## 🔧 Commands Reference

| Prefix | Command | Description |
|--------|---------|-------------|
| . ! / # | `.menu` | Show full menu with logo |
| | `.ask [question]` | Chat with Groq AI |
| | `.roast [@user]` | AI roast |
| | `.vv` | Save view once message |
| | `.sticker` | Image/video → sticker |
| | `.tiktok [url]` | TikTok no watermark |
| | `.daily` | Claim daily coins |
| | `.trivia` | Trivia game |
| | `.hangman` | Hangman game |
| | `.slots [bet]` | Slot machine |
| | `.weather [city]` | Weather info |
| | `.autoview on/off` | Auto view statuses |
| | `.recovered` | Show deleted messages |
| | `.faketype [sec]` | Fake typing indicator |
| | `.broadcast [msg]` | Owner: blast all users |

---

## 👑 Owner Info

- **Owner:** Legendary Smiley Cymor
- **Support:** +254 784 074 568
- **Brand:** Cymor Tech Services

---

## 📞 Support

DM on WhatsApp: [wa.me/254784074568](https://wa.me/254784074568)
