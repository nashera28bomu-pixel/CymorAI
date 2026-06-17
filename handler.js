import { parseCommand, isOwner, isSpamming, cleanJid } from './lib/utils.js';
import { sendMenu, sendText } from './lib/sender.js';
import { buildMenuText } from './lib/sender.js';
import { getUser, getGroup, getTodayStats, Subscriber } from './database/db.js';
import { getLevelFromXP } from './lib/utils.js';
import { aiCommands } from './commands/ai.js';
import { gameCommands } from './commands/games.js';
import { economyCommands } from './commands/economy.js';
import { mediaCommands } from './commands/media.js';
import { utilityCommands } from './commands/utility.js';
import { groupCommands } from './commands/group.js';
import { privacyCommands, getSettings, cacheDeletedMessage } from './commands/privacy.js';
import { ownerCommands } from './commands/owner.js';

const allCommands = {
  ...aiCommands,
  ...gameCommands,
  ...economyCommands,
  ...mediaCommands,
  ...utilityCommands,
  ...groupCommands,
  ...privacyCommands,
  ...ownerCommands,
};

export async function handleMessage(sock, m) {
  try {
    const msg = m.messages?.[0];
    if (!msg || msg.key.fromMe) return;

    const jid = msg.key.remoteJid;
    const isGroup = jid.endsWith('@g.us');
    const sender = isGroup ? msg.key.participant : jid;
    if (!sender) return;

    const pushName = msg.pushName || sender.split('@')[0];
    const senderClean = cleanJid(sender);

    // Get message content
    const content = msg.message;
    if (!content) return;

    const text = content.conversation
      || content.extendedTextMessage?.text
      || content.imageMessage?.caption
      || content.videoMessage?.caption
      || '';

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
      ? { message: msg.message.extendedTextMessage.contextInfo.quotedMessage, key: { remoteJid: jid, id: msg.message.extendedTextMessage.contextInfo.stanzaId, participant: msg.message.extendedTextMessage.contextInfo.participant } }
      : null;

    const mentionedJids = content.extendedTextMessage?.contextInfo?.mentionedJid || [];

    // Update stats
    const stats = await getTodayStats();
    stats.messagesReceived++;
    if (!stats.activeUsers.includes(senderClean)) stats.activeUsers.push(senderClean);
    stats.save().catch(() => {});

    // Check user ban
    const user = await getUser(senderClean, pushName);
    if (user.role === 'banned') return;

    // XP gain on every message
    user.xp += 2;
    user.messageCount++;
    user.lastSeen = new Date();
    const newLevel = getLevelFromXP(user.xp);
    if (newLevel > user.level) {
      user.level = newLevel;
      await sendText(sock, jid, `🎉 *Level Up!* @${senderClean}\n\n🏆 You reached Level *${newLevel}*!\n+500 bonus coins! 🪙`, null);
      user.coins += 500;
    }
    user.save().catch(() => {});

    // Auto-subscribe user for broadcasts
    Subscriber.findOneAndUpdate(
      { jid: senderClean },
      { jid: senderClean, name: pushName },
      { upsert: true }
    ).catch(() => {});

    // Privacy features - auto blue tick
    const settings = getSettings(senderClean);
    if (settings.autoblue && !isGroup) {
      await sock.readMessages([msg.key]);
    }

    // Anti-spam check
    if (isGroup && isSpamming(senderClean)) {
      const group = await getGroup(jid);
      if (group.antispam) {
        await sock.sendMessage(jid, { delete: msg.key });
        return;
      }
    }

    // Anti-link check
    if (isGroup && text.includes('https://') || text.includes('http://')) {
      const group = await getGroup(jid);
      if (group.antilink) {
        const meta = await sock.groupMetadata(jid).catch(() => null);
        const isAdmin = meta?.participants?.find(p => p.id === sender)?.admin;
        if (!isAdmin && !isOwner(senderClean)) {
          await sock.sendMessage(jid, { delete: msg.key });
          await sendText(sock, jid, `⚠️ @${senderClean} links are not allowed in this group!`);
          return;
        }
      }
    }

    // Check for trivia answers (before command parsing)
    if (text && !parseCommand(text)) {
      await gameCommands.checkTrivia(sock, jid, senderClean, text);
    }

    // Parse command
    const parsed = parseCommand(text);
    if (!parsed) return;

    const { cmd, args, text: cmdText } = parsed;

    // Get group meta for admin check
    let isAdmin = false;
    let isBotAdmin = false;
    if (isGroup) {
      try {
        const meta = await sock.groupMetadata(jid);
        const botJid = sock.user.id.replace(/:.*@/, '@');
        isAdmin = !!meta.participants.find(p => p.id === sender)?.admin || isOwner(senderClean);
        isBotAdmin = !!meta.participants.find(p => p.id === botJid)?.admin;
      } catch {}
    }

    // Context object passed to every command
    const ctx = {
      sock, jid, sender: senderClean, pushName,
      args, text: cmdText, msg, quoted,
      isGroup, isAdmin, isBotAdmin,
      mentionedJids, user,
    };

    // .menu
    if (cmd === 'menu' || cmd === 'help' || cmd === 'start') {
      const menuText = buildMenuText(pushName);
      return sendMenu(sock, jid, menuText, msg);
    }

    // Find and run command
    const command = allCommands[cmd];
    if (!command) return; // silently ignore unknown commands

    // Track command usage
    stats.commandsRun++;
    stats.save().catch(() => {});
    user.stats.commandsUsed++;
    user.save().catch(() => {});

    await command(ctx);

  } catch (err) {
    console.error('Handler error:', err.message);
    const stats = await getTodayStats().catch(() => null);
    if (stats) { stats.errors++; stats.save().catch(() => {}); }
  }
}

export async function handleStatusUpdate(sock, update) {
  // Auto-view and auto-like statuses
  try {
    const { id, type } = update;
    if (type !== 'status') return;

    // Get all users with autoview on - for simplicity, view all statuses
    // since we can't know per-user here without iterating all settings
    await sock.readMessages([{ remoteJid: 'status@broadcast', id, participant: update.participant }]);
  } catch {}
}

export async function handleGroupParticipant(sock, event) {
  try {
    const { id: jid, participants, action } = event;
    if (action !== 'add') return;

    const group = await getGroup(jid);
    if (!group.welcome) return;

    for (const participant of participants) {
      const welcomeMsg = group.welcomeMsg
        ? group.welcomeMsg.replace('{name}', `@${participant.split('@')[0]}`)
        : `👋 Welcome to the group, @${participant.split('@')[0]}! 🎉\n\nWe're happy to have you here!\n\n> 🤖 Smiley Cymor Bot`;

      await sock.sendMessage(jid, {
        text: welcomeMsg,
        mentions: [participant],
      });
    }
  } catch {}
}

export async function handleMessageDelete(sock, update) {
  try {
    for (const key of update.keys || []) {
      // We need the original message - cache it before deletion
      // This is already handled by caching incoming messages
    }
  } catch {}
}

// Cache all incoming messages for deleted message recovery
const messageCache = new Map();

export function cacheMessage(msg) {
  try {
    const jid = msg.key.remoteJid;
    const id = msg.key.id;
    if (!messageCache.has(jid)) messageCache.set(jid, new Map());
    const chatCache = messageCache.get(jid);
    chatCache.set(id, msg);
    // Keep only last 50 messages per chat
    if (chatCache.size > 50) {
      const firstKey = chatCache.keys().next().value;
      chatCache.delete(firstKey);
    }
  } catch {}
}

export async function handleRevoke(sock, update) {
  try {
    for (const key of (update.keys || [])) {
      const jid = key.remoteJid;
      const chatCache = messageCache.get(jid);
      if (!chatCache) continue;
      const original = chatCache.get(key.id);
      if (original) {
        await cacheDeletedMessage(original, jid);
        chatCache.delete(key.id);
      }
    }
  } catch {}
}
