import { sendText, fakeTyping, fakeRecording } from '../lib/sender.js';
import { DeletedMsg, getUser } from '../database/db.js';

// Per-user settings stored in memory (also save to DB via user doc)
export const privacySettings = new Map(); // jid -> { autoview, autolike, autoblue, ghost }

export function getSettings(jid) {
  if (!privacySettings.has(jid)) {
    privacySettings.set(jid, { autoview: false, autolike: false, autoblue: false, ghost: false });
  }
  return privacySettings.get(jid);
}

export const privacyCommands = {
  autoview: async ({ sock, jid, sender, args, msg }) => {
    const settings = getSettings(sender);
    const on = args[0]?.toLowerCase() === 'on';
    settings.autoview = on;
    return sendText(sock, jid, `👁️ Auto-view status *${on ? 'ENABLED' : 'DISABLED'}*\n${on ? 'I will automatically view all statuses!' : 'Status viewing is now manual.'}`, msg);
  },

  autolike: async ({ sock, jid, sender, args, msg }) => {
    const settings = getSettings(sender);
    const on = args[0]?.toLowerCase() === 'on';
    settings.autolike = on;
    return sendText(sock, jid, `❤️ Auto-like status *${on ? 'ENABLED' : 'DISABLED'}*\n${on ? 'I will automatically react ❤️ to all statuses!' : 'Auto-like disabled.'}`, msg);
  },

  autoblue: async ({ sock, jid, sender, args, msg }) => {
    const settings = getSettings(sender);
    const on = args[0]?.toLowerCase() === 'on';
    settings.autoblue = on;
    return sendText(sock, jid, `✅ Auto blue tick *${on ? 'ENABLED' : 'DISABLED'}*\n${on ? 'Messages will be auto-read!' : 'Auto blue tick disabled.'}`, msg);
  },

  ghost: async ({ sock, jid, sender, args, msg }) => {
    const settings = getSettings(sender);
    const on = args[0]?.toLowerCase() === 'on';
    settings.ghost = on;
    if (on) {
      await sock.sendPresenceUpdate('unavailable', jid);
    } else {
      await sock.sendPresenceUpdate('available', jid);
    }
    return sendText(sock, jid, `👻 Ghost mode *${on ? 'ENABLED' : 'DISABLED'}*\n${on ? 'You appear offline to everyone!' : 'You appear online again.'}`, msg);
  },

  faketype: async ({ sock, jid, text, msg }) => {
    const secs = parseInt(text) || 5;
    if (secs > 60) return sendText(sock, jid, '❌ Max is 60 seconds!', msg);
    await sendText(sock, jid, `⌨️ Faking typing for ${secs} seconds...`, msg);
    await fakeTyping(sock, jid, secs);
    return sendText(sock, jid, '✅ Done!');
  },

  fakerec: async ({ sock, jid, text, msg }) => {
    const secs = parseInt(text) || 5;
    if (secs > 60) return sendText(sock, jid, '❌ Max is 60 seconds!', msg);
    await sendText(sock, jid, `🎤 Faking recording for ${secs} seconds...`, msg);
    await fakeRecording(sock, jid, secs);
    return sendText(sock, jid, '✅ Done!');
  },

  recovered: async ({ sock, jid, sender, msg }) => {
    try {
      const msgs = await DeletedMsg.find({ jid }).sort({ timestamp: -1 }).limit(5);
      if (!msgs.length) return sendText(sock, jid, '🗑️ No recently deleted messages found in this chat.', msg);
      let text = `🔍 *Recently Deleted Messages*\n${'─'.repeat(28)}\n\n`;
      msgs.forEach((m, i) => {
        const time = new Date(m.timestamp).toLocaleTimeString();
        text += `*${i + 1}.* From: ${m.senderName || m.sender.split('@')[0]}\n⏰ ${time}\n📝 ${m.content || `[${m.type} message]`}\n\n`;
      });
      return sendText(sock, jid, text, msg);
    } catch {
      return sendText(sock, jid, '❌ Could not fetch deleted messages.', msg);
    }
  },
};

// Called from handler when a message is deleted
export async function cacheDeletedMessage(msg, jid) {
  try {
    const content = msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || null;
    const type = msg.message?.imageMessage ? 'image'
      : msg.message?.videoMessage ? 'video'
      : msg.message?.audioMessage ? 'audio'
      : msg.message?.documentMessage ? 'document'
      : 'text';

    await DeletedMsg.create({
      jid,
      sender: msg.key.participant || msg.key.remoteJid,
      senderName: msg.pushName || '',
      content,
      type,
    });
  } catch {}
}
