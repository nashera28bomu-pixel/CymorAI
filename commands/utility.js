import { sendText, sendImage } from '../lib/sender.js';
import { randomItem, formatTime } from '../lib/utils.js';
import { config } from '../config.js';
import axios from 'axios';
import { create as mathCreate, all } from 'mathjs';

const math = mathCreate(all);

const startTime = Date.now();

const quotes = [
  '"The only way to do great work is to love what you do." — Steve Jobs',
  '"In the middle of every difficulty lies opportunity." — Einstein',
  '"Success is not final, failure is not fatal." — Churchill',
  '"Dream big, work hard, stay focused." — Unknown',
  '"Every expert was once a beginner." — Helen Hayes',
  '"Your limitation is only your imagination." — Unknown',
  '"Push yourself, because no one else will do it for you." — Unknown',
  '"Great things never come from comfort zones." — Unknown',
  '"The harder you work, the luckier you get." — Gary Player',
];

const pendingReminders = new Map();

export const utilityCommands = {
  ping: async ({ sock, jid, msg }) => {
    const start = Date.now();
    const sent = await sendText(sock, jid, '🏓 Pinging...');
    const ms = Date.now() - start;
    return sendText(sock, jid, `🏓 *Pong!*\n⚡ Speed: *${ms}ms*\n🤖 Bot is online and running!`, msg);
  },

  uptime: async ({ sock, jid, msg }) => {
    const up = formatTime(Date.now() - startTime);
    return sendText(sock, jid, `⏱️ *Bot Uptime:* ${up}\n🤖 ${config.botName} is running smoothly!`, msg);
  },

  speed: async ({ sock, jid, msg }) => {
    const start = Date.now();
    await sendText(sock, jid, '📡 Testing bot speed...');
    const ms = Date.now() - start;
    const rating = ms < 500 ? '🟢 Excellent' : ms < 1000 ? '🟡 Good' : '🔴 Slow';
    return sendText(sock, jid, `📊 *Speed Test Results*\n\n⚡ Response: *${ms}ms*\n📶 Rating: ${rating}\n🤖 Status: Online`, msg);
  },

  calc: async ({ sock, jid, text, msg }) => {
    if (!text) return sendText(sock, jid, '🧮 Usage: .calc [expression]\nExample: .calc 15 * 24 + 100', msg);
    try {
      const result = math.evaluate(text);
      return sendText(sock, jid, `🧮 *Calculator*\n\n📝 ${text}\n✅ = *${result}*`, msg);
    } catch {
      return sendText(sock, jid, '❌ Invalid expression! Example: .calc 50 * 2 + 10', msg);
    }
  },

  weather: async ({ sock, jid, text, msg }) => {
    const city = text || 'Nairobi';
    try {
      const res = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { timeout: 10000 });
      const d = res.data.current_condition[0];
      const desc = d.weatherDesc[0].value;
      const temp = d.temp_C;
      const feels = d.FeelsLikeC;
      const humidity = d.humidity;
      const wind = d.windspeedKmph;
      return sendText(sock, jid, `🌤️ *Weather: ${city}*\n\n🌡️ Temp: *${temp}°C* (Feels ${feels}°C)\n☁️ ${desc}\n💧 Humidity: ${humidity}%\n💨 Wind: ${wind} km/h\n\n> 🤖 Smiley Cymor Bot`, msg);
    } catch {
      return sendText(sock, jid, `❌ Could not fetch weather for ${city}. Check the city name.`, msg);
    }
  },

  time: async ({ sock, jid, text, msg }) => {
    const city = text || 'Nairobi';
    const zones = {
      nairobi: 'Africa/Nairobi', london: 'Europe/London', 'new york': 'America/New_York',
      dubai: 'Asia/Dubai', tokyo: 'Asia/Tokyo', sydney: 'Australia/Sydney',
      paris: 'Europe/Paris', lagos: 'Africa/Lagos', mumbai: 'Asia/Kolkata',
    };
    const tz = zones[city.toLowerCase()] || 'Africa/Nairobi';
    const t = new Date().toLocaleString('en-US', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return sendText(sock, jid, `🕐 *Time in ${city}*\n\n${t}\n📍 Timezone: ${tz}`, msg);
  },

  define: async ({ sock, jid, text, msg }) => {
    if (!text) return sendText(sock, jid, '📖 Usage: .define [word]', msg);
    try {
      const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(text)}`, { timeout: 10000 });
      const entry = res.data[0];
      const meanings = entry.meanings.slice(0, 2).map(m => `*${m.partOfSpeech}*: ${m.definitions[0].definition}`).join('\n\n');
      return sendText(sock, jid, `📖 *${entry.word}*\n${entry.phonetic || ''}\n\n${meanings}`, msg);
    } catch {
      return sendText(sock, jid, `❌ Could not find definition for "${text}"`, msg);
    }
  },

  wiki: async ({ sock, jid, text, msg }) => {
    if (!text) return sendText(sock, jid, '🌐 Usage: .wiki [search query]', msg);
    try {
      const res = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(text)}`, { timeout: 10000 });
      const { title, extract } = res.data;
      const short = extract?.slice(0, 600) + (extract?.length > 600 ? '...' : '');
      return sendText(sock, jid, `📚 *${title}*\n\n${short}\n\n🔗 en.wikipedia.org/wiki/${encodeURIComponent(text)}`, msg);
    } catch {
      return sendText(sock, jid, `❌ No Wikipedia article found for "${text}"`, msg);
    }
  },

  quote: async ({ sock, jid, msg }) => {
    const q = randomItem(quotes);
    return sendText(sock, jid, `✨ *Quote of the Moment*\n\n_${q}_\n\n> 🤖 Smiley Cymor Bot`, msg);
  },

  remind: async ({ sock, jid, sender, args, msg }) => {
    const mins = parseInt(args[0]);
    const reminder = args.slice(1).join(' ');
    if (!mins || !reminder) return sendText(sock, jid, '⏰ Usage: .remind [minutes] [message]\nExample: .remind 30 Call mom', msg);
    if (mins > 1440) return sendText(sock, jid, '❌ Max reminder is 1440 minutes (24 hours)', msg);
    await sendText(sock, jid, `⏰ Reminder set! I\'ll ping you in *${mins} minute${mins > 1 ? 's' : ''}*.\n📝 "${reminder}"`, msg);
    setTimeout(async () => {
      await sendText(sock, sender, `⏰ *REMINDER!*\n\n📝 ${reminder}\n\n_Set ${mins} minutes ago_`);
    }, mins * 60 * 1000);
  },

  qr: async ({ sock, jid, text, msg }) => {
    if (!text) return sendText(sock, jid, '📱 Usage: .qr [text or url]', msg);
    try {
      const res = await axios.get(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`, { responseType: 'arraybuffer', timeout: 10000 });
      return sendImage(sock, jid, Buffer.from(res.data), `📱 *QR Code*\n_${text}_`, msg);
    } catch {
      return sendText(sock, jid, '❌ Failed to generate QR code.', msg);
    }
  },

  short: async ({ sock, jid, text, msg }) => {
    if (!text || !text.startsWith('http')) return sendText(sock, jid, '🔗 Usage: .short [url]', msg);
    try {
      const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`, { timeout: 10000 });
      return sendText(sock, jid, `🔗 *Shortened URL*\n\n📎 Original: ${text}\n✂️ Short: ${res.data}`, msg);
    } catch {
      return sendText(sock, jid, '❌ Could not shorten URL.', msg);
    }
  },

  info: async ({ sock, jid, msg }) => {
    return sendText(sock, jid, `🤖 *${config.botName}*\n${'─'.repeat(28)}\n👑 Owner: Legendary Smiley Cymor\n🏢 By: Cymor Tech Services\n📱 Version: ${config.version}\n🛠️ Engine: Baileys + Node.js\n🧠 AI: Groq (LLaMA3)\n💾 DB: MongoDB\n${'─'.repeat(28)}\n📞 Support: wa.me/254784074568\n\n_Type .menu for all commands_`, msg);
  },

  support: async ({ sock, jid, msg }) => {
    return sendText(sock, jid, `📞 *Support & Help*\n\n👤 For issues with the bot, contact:\n📱 *+254 784 074 568*\n🔗 wa.me/254784074568\n\n💬 Or use: *.report [your issue]*\n\n> 🤖 Powered by Cymor Tech Services`, msg);
  },

  report: async ({ sock, jid, text, sender, pushName, msg }) => {
    if (!text) return sendText(sock, jid, '🐛 Usage: .report [describe the issue]', msg);
    const report = `🐛 *Bug Report*\n\nFrom: ${pushName} (${sender})\nIssue: ${text}\nTime: ${new Date().toLocaleString()}`;
    await sock.sendMessage(`${config.supportNumber}@s.whatsapp.net`, { text: report });
    return sendText(sock, jid, '✅ Report sent! Our team will look into it.\n📞 For urgent help: wa.me/254784074568', msg);
  },

  fancy: async ({ sock, jid, text, msg }) => {
    if (!text) return sendText(sock, jid, '✨ Usage: .fancy [your text]', msg);
    const styles = [
      text.split('').join(' '),
      `「${text}」`,
      `『${text}』`,
      `《${text}》`,
      `【${text}】`,
      `✦ ${text} ✦`,
      `★彡 ${text} 彡★`,
      `⚡ ${text} ⚡`,
    ];
    return sendText(sock, jid, `✨ *Fancy Text: "${text}"*\n\n${styles.join('\n')}`, msg);
  },
};
