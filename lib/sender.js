import { logoBuffer } from './utils.js';
import { config } from '../config.js';

export async function sendText(sock, jid, text, quoted = null) {
  return sock.sendMessage(jid, { text }, quoted ? { quoted } : {});
}

export async function sendImage(sock, jid, buffer, caption = '', quoted = null) {
  return sock.sendMessage(jid, { image: buffer, caption }, quoted ? { quoted } : {});
}

export async function sendVideo(sock, jid, buffer, caption = '') {
  return sock.sendMessage(jid, { video: buffer, caption, mimetype: 'video/mp4' });
}

export async function sendAudio(sock, jid, buffer, ptt = false) {
  return sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mp4', ptt });
}

export async function sendSticker(sock, jid, buffer, quoted = null) {
  return sock.sendMessage(jid, { sticker: buffer }, quoted ? { quoted } : {});
}

export async function sendReaction(sock, jid, msgKey, emoji) {
  return sock.sendMessage(jid, { react: { text: emoji, key: msgKey } });
}

export async function sendTyping(sock, jid, duration = 2000) {
  await sock.sendPresenceUpdate('composing', jid);
  await new Promise(r => setTimeout(r, duration));
  await sock.sendPresenceUpdate('paused', jid);
}

export async function sendRecording(sock, jid, duration = 2000) {
  await sock.sendPresenceUpdate('recording', jid);
  await new Promise(r => setTimeout(r, duration));
  await sock.sendPresenceUpdate('paused', jid);
}

export async function sendWithLogo(sock, jid, caption, quoted = null) {
  const logo = logoBuffer();
  if (logo) {
    return sock.sendMessage(jid, { image: logo, caption }, quoted ? { quoted } : {});
  }
  return sendText(sock, jid, caption, quoted);
}

export async function sendMenu(sock, jid, menuText, quoted = null) {
  const logo = logoBuffer();
  if (logo) {
    // Send logo first as the header image
    await sock.sendMessage(jid, {
      image: logo,
      caption: menuText,
      jpegThumbnail: logo,
    }, quoted ? { quoted } : {});
    return;
  }
  return sendText(sock, jid, menuText, quoted);
}

export async function broadcastMessage(sock, jids, text) {
  const results = { sent: 0, failed: 0 };
  for (const jid of jids) {
    try {
      await sendText(sock, jid, text);
      results.sent++;
      await new Promise(r => setTimeout(r, 1200)); // delay to avoid ban
    } catch {
      results.failed++;
    }
  }
  return results;
}

export async function fakeTyping(sock, jid, durationSec = 5) {
  await sock.sendPresenceUpdate('composing', jid);
  await new Promise(r => setTimeout(r, durationSec * 1000));
  await sock.sendPresenceUpdate('paused', jid);
}

export async function fakeRecording(sock, jid, durationSec = 5) {
  await sock.sendPresenceUpdate('recording', jid);
  await new Promise(r => setTimeout(r, durationSec * 1000));
  await sock.sendPresenceUpdate('paused', jid);
}

export function buildMenuText(userName = 'User') {
  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 5  ? '🌙 Good Night'     :
    hour < 12 ? '🌅 Good Morning'   :
    hour < 17 ? '☀️ Good Afternoon' :
    hour < 21 ? '🌆 Good Evening'   : '🌙 Good Night';

  const time = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return `
╭━━━━━━━━━━━━━━━━━━━━━━━╮
┃   🤖 *SMILEY CYMOR BOT* 🤖   ┃
┃   ✨ _v2.0 — Multi-User MD Bot_ ✨   ┃
╰━━━━━━━━━━━━━━━━━━━━━━━╯

${greeting}, *${userName}!* 👋
🕐 *${time}*  •  📅 *${date}*
🔑 *Prefixes:* \`.\`  \`!\`  \`/\`  \`#\`

▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬

🤖 *[ AI & INTELLIGENCE ]*
┌─────────────────────────
│ ✦ .ask [question]
│ ✦ .roast [@user]
│ ✦ .rizz — pickup line
│ ✦ .debate [topic]
│ ✦ .story [prompt]
│ ✦ .joke — random joke
│ ✦ .recipe [dish]
│ ✦ .fixcode [code]
│ ✦ .translate [lang] [text]
│ ✦ .summarize [text]
│ ✦ .imagine [prompt]
│ ✦ .clear — reset AI memory
└─────────────────────────

🎵 *[ MEDIA & DOWNLOADS ]*
┌─────────────────────────
│ ✦ .play [song name]
│ ✦ .tiktok [url]
│ ✦ .ig [instagram url]
│ ✦ .sticker — reply image/vid
│ ✦ .toimg — sticker → image
│ ✦ .gif — video → gif
│ ✦ .vv — save view once 👁️
└─────────────────────────

🎨 *[ IMAGE & DESIGN ]*
┌─────────────────────────
│ ✦ .fancy [text]
│ ✦ .qr [text/url]
└─────────────────────────

💰 *[ ECONOMY SYSTEM ]*
┌─────────────────────────
│ ✦ .daily — claim coins 🪙
│ ✦ .balance
│ ✦ .profile
│ ✦ .transfer [@user] [amt]
│ ✦ .leaderboard 🏆
│ ✦ .shop
│ ✦ .buy [item number]
│ ✦ .inventory
└─────────────────────────

🎮 *[ GAMES & FUN ]*
┌─────────────────────────
│ ✦ .trivia
│ ✦ .hangman + .guess [letter]
│ ✦ .rps [rock/paper/scissors]
│ ✦ .dice [bet]
│ ✦ .flip [bet] [heads/tails]
│ ✦ .slots [bet] 🎰
│ ✦ .casino [amount]
│ ✦ .8ball [question]
│ ✦ .truth / .dare
└─────────────────────────

📊 *[ UTILITIES ]*
┌─────────────────────────
│ ✦ .weather [city]
│ ✦ .calc [expression]
│ ✦ .time [city]
│ ✦ .define [word]
│ ✦ .wiki [query]
│ ✦ .quote
│ ✦ .remind [mins] [msg]
│ ✦ .short [url]
│ ✦ .ping / .speed / .uptime
└─────────────────────────

👥 *[ GROUP MANAGEMENT ]*
┌─────────────────────────
│ ✦ .kick / .add / .promote
│ ✦ .demote / .mute / .unmute
│ ✦ .warn / .resetwarn
│ ✦ .tagall [message]
│ ✦ .poll [q] | [opt1] | [opt2]
│ ✦ .antilink on/off
│ ✦ .antispam on/off
│ ✦ .welcome on/off
│ ✦ .setwelcome [msg]
│ ✦ .groupinfo / .link
└─────────────────────────

👻 *[ PRIVACY & STEALTH ]*
┌─────────────────────────
│ ✦ .autoview on/off
│ ✦ .autolike on/off
│ ✦ .autoblue on/off
│ ✦ .ghost on/off 👻
│ ✦ .faketype [seconds]
│ ✦ .fakerec [seconds]
│ ✦ .recovered — deleted msgs 🗑️
└─────────────────────────

ℹ️ *[ INFO & SUPPORT ]*
┌─────────────────────────
│ ✦ .info — bot info
│ ✦ .support — get help
│ ✦ .report [issue]
└─────────────────────────

▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
👑 *Owner:* Legendary Smiley Cymor
📞 *Support:* wa.me/254784074568
🔖 *Version:* v2.0.0
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
> 🤖 _Powered by *Cymor Tech Services*_`.trim();
}
}
