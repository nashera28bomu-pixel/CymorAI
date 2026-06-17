import { config } from '../config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getPrefix(text) {
  for (const p of config.prefixes) {
    if (text.startsWith(p)) return p;
  }
  return null;
}

export function parseCommand(text) {
  const prefix = getPrefix(text);
  if (!prefix) return null;
  const [cmd, ...args] = text.slice(prefix.length).trim().split(/\s+/);
  return { prefix, cmd: cmd.toLowerCase(), args, text: args.join(' ') };
}

export function isOwner(jid) {
  return jid.replace('@s.whatsapp.net', '') === config.ownerNumber;
}

export function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function formatNumber(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export function cleanJid(jid) {
  return jid?.replace(/:[0-9]+@/, '@') || '';
}

export function phoneFromJid(jid) {
  return jid?.split('@')[0] || '';
}

export function getLevelFromXP(xp) {
  return Math.floor(0.1 * Math.sqrt(xp)) + 1;
}

export function getXPForLevel(level) {
  return Math.pow((level - 1) / 0.1, 2);
}

export function getLogoPath() {
  return path.join(__dirname, '../public/logo.png');
}

export function logoBuffer() {
  const p = getLogoPath();
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

export const rateLimit = new Map();

export function checkRateLimit(jid, cmd, limitMs = 3000) {
  const key = `${jid}:${cmd}`;
  const last = rateLimit.get(key);
  const now = Date.now();
  if (last && now - last < limitMs) {
    return false;
  }
  rateLimit.set(key, now);
  return true;
}

// Format menu box
export function box(title, items) {
  const line = '─'.repeat(28);
  const rows = items.map(i => `│  ${i}`).join('\n');
  return `╭${line}╮\n│  *${title}*\n├${line}┤\n${rows}\n╰${line}╯`;
}

export function menuSection(emoji, title, cmds) {
  return `\n${emoji} *${title}*\n${cmds.map(c => `  ╸ ${c}`).join('\n')}`;
}

// Anti-spam tracker
const spamTracker = new Map();
export function isSpamming(jid, limit = 5, window = 5000) {
  const now = Date.now();
  if (!spamTracker.has(jid)) spamTracker.set(jid, []);
  const times = spamTracker.get(jid).filter(t => now - t < window);
  times.push(now);
  spamTracker.set(jid, times);
  return times.length > limit;
}
