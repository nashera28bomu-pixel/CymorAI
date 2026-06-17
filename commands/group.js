import { sendText } from '../lib/sender.js';
import { getGroup, getUser } from '../database/db.js';
import { config } from '../config.js';

export const groupCommands = {
  kick: async ({ sock, jid, isGroup, isAdmin, mentionedJids, msg }) => {
    if (!isGroup) return sendText(sock, jid, '❌ Group only command!', msg);
    if (!isAdmin) return sendText(sock, jid, '❌ You need to be an admin to kick!', msg);
    if (!mentionedJids?.length) return sendText(sock, jid, '❌ Tag someone to kick: .kick @user', msg);
    for (const user of mentionedJids) {
      await sock.groupParticipantsUpdate(jid, [user], 'remove');
    }
    return sendText(sock, jid, `✅ Kicked ${mentionedJids.length} member(s)`, msg);
  },

  add: async ({ sock, jid, isGroup, isAdmin, args, msg }) => {
    if (!isGroup) return sendText(sock, jid, '❌ Group only command!', msg);
    if (!isAdmin) return sendText(sock, jid, '❌ You need to be an admin!', msg);
    const num = args[0]?.replace(/[^0-9]/g, '');
    if (!num) return sendText(sock, jid, '❌ Usage: .add [number]\nExample: .add 254712345678', msg);
    try {
      await sock.groupParticipantsUpdate(jid, [`${num}@s.whatsapp.net`], 'add');
      return sendText(sock, jid, `✅ Added +${num} to the group!`, msg);
    } catch {
      return sendText(sock, jid, `❌ Could not add +${num}. They may have privacy settings enabled.`, msg);
    }
  },

  promote: async ({ sock, jid, isGroup, isAdmin, mentionedJids, msg }) => {
    if (!isGroup) return sendText(sock, jid, '❌ Group only!', msg);
    if (!isAdmin) return sendText(sock, jid, '❌ Admins only!', msg);
    if (!mentionedJids?.length) return sendText(sock, jid, '❌ Tag someone: .promote @user', msg);
    await sock.groupParticipantsUpdate(jid, mentionedJids, 'promote');
    return sendText(sock, jid, `⬆️ Promoted ${mentionedJids.length} member(s) to admin!`, msg);
  },

  demote: async ({ sock, jid, isGroup, isAdmin, mentionedJids, msg }) => {
    if (!isGroup) return sendText(sock, jid, '❌ Group only!', msg);
    if (!isAdmin) return sendText(sock, jid, '❌ Admins only!', msg);
    if (!mentionedJids?.length) return sendText(sock, jid, '❌ Tag someone: .demote @user', msg);
    await sock.groupParticipantsUpdate(jid, mentionedJids, 'demote');
    return sendText(sock, jid, `⬇️ Demoted ${mentionedJids.length} member(s) from admin.`, msg);
  },

  mute: async ({ sock, jid, isGroup, isAdmin, msg }) => {
    if (!isGroup) return sendText(sock, jid, '❌ Group only!', msg);
    if (!isAdmin) return sendText(sock, jid, '❌ Admins only!', msg);
    await sock.groupSettingUpdate(jid, 'announcement');
    const group = await getGroup(jid);
    group.mute = true; await group.save();
    return sendText(sock, jid, '🔇 Group muted! Only admins can send messages now.', msg);
  },

  unmute: async ({ sock, jid, isGroup, isAdmin, msg }) => {
    if (!isGroup) return sendText(sock, jid, '❌ Group only!', msg);
    if (!isAdmin) return sendText(sock, jid, '❌ Admins only!', msg);
    await sock.groupSettingUpdate(jid, 'not_announcement');
    const group = await getGroup(jid);
    group.mute = false; await group.save();
    return sendText(sock, jid, '🔊 Group unmuted! Everyone can send messages now.', msg);
  },

  warn: async ({ sock, jid, isGroup, isAdmin, mentionedJids, sender, msg }) => {
    if (!isGroup) return sendText(sock, jid, '❌ Group only!', msg);
    if (!isAdmin) return sendText(sock, jid, '❌ Admins only!', msg);
    if (!mentionedJids?.length) return sendText(sock, jid, '❌ Tag someone: .warn @user', msg);
    const group = await getGroup(jid);
    for (const user of mentionedJids) {
      const warns = (group.warns.get(user) || 0) + 1;
      group.warns.set(user, warns);
      if (warns >= 3) {
        await sock.groupParticipantsUpdate(jid, [user], 'remove');
        await sendText(sock, jid, `🚫 @${user.split('@')[0]} has been kicked after 3 warnings!`, msg);
      } else {
        await sendText(sock, jid, `⚠️ @${user.split('@')[0]} has been warned!\nWarnings: *${warns}/3*\n3 warnings = auto kick.`, msg);
      }
    }
    await group.save();
  },

  resetwarn: async ({ sock, jid, isGroup, isAdmin, mentionedJids, msg }) => {
    if (!isGroup) return sendText(sock, jid, '❌ Group only!', msg);
    if (!isAdmin) return sendText(sock, jid, '❌ Admins only!', msg);
    const group = await getGroup(jid);
    for (const user of mentionedJids || []) {
      group.warns.set(user, 0);
    }
    await group.save();
    return sendText(sock, jid, '✅ Warnings reset!', msg);
  },

  tagall: async ({ sock, jid, isGroup, isAdmin, text, msg }) => {
    if (!isGroup) return sendText(sock, jid, '❌ Group only!', msg);
    if (!isAdmin) return sendText(sock, jid, '❌ Admins only!', msg);
    try {
      const meta = await sock.groupMetadata(jid);
      const members = meta.participants.map(p => p.id);
      const tags = members.map(m => `@${m.split('@')[0]}`).join(' ');
      return sock.sendMessage(jid, {
        text: `📢 *${text || 'Attention everyone!'}*\n\n${tags}`,
        mentions: members,
      });
    } catch {
      return sendText(sock, jid, '❌ Failed to tag all members.', msg);
    }
  },

  groupinfo: async ({ sock, jid, isGroup, msg }) => {
    if (!isGroup) return sendText(sock, jid, '❌ Group only!', msg);
    try {
      const meta = await sock.groupMetadata(jid);
      const admins = meta.participants.filter(p => p.admin).length;
      return sendText(sock, jid, `👥 *Group Info*\n\n📛 Name: ${meta.subject}\n👤 Members: ${meta.participants.length}\n👑 Admins: ${admins}\n📅 Created: ${new Date(meta.creation * 1000).toDateString()}\n📝 Desc: ${meta.desc || 'No description'}`, msg);
    } catch {
      return sendText(sock, jid, '❌ Could not fetch group info.', msg);
    }
  },

  link: async ({ sock, jid, isGroup, isAdmin, msg }) => {
    if (!isGroup) return sendText(sock, jid, '❌ Group only!', msg);
    if (!isAdmin) return sendText(sock, jid, '❌ Admins only!', msg);
    try {
      const code = await sock.groupInviteCode(jid);
      return sendText(sock, jid, `🔗 *Group Invite Link*\n\nhttps://chat.whatsapp.com/${code}`, msg);
    } catch {
      return sendText(sock, jid, '❌ Could not get invite link.', msg);
    }
  },

  welcome: async ({ sock, jid, isGroup, isAdmin, args, msg }) => {
    if (!isGroup) return sendText(sock, jid, '❌ Group only!', msg);
    if (!isAdmin) return sendText(sock, jid, '❌ Admins only!', msg);
    const group = await getGroup(jid);
    const on = args[0]?.toLowerCase() === 'on';
    group.welcome = on; await group.save();
    return sendText(sock, jid, `${on ? '✅' : '❌'} Welcome messages turned *${on ? 'ON' : 'OFF'}*`, msg);
  },

  setwelcome: async ({ sock, jid, isGroup, isAdmin, text, msg }) => {
    if (!isGroup) return sendText(sock, jid, '❌ Group only!', msg);
    if (!isAdmin) return sendText(sock, jid, '❌ Admins only!', msg);
    if (!text) return sendText(sock, jid, '❌ Usage: .setwelcome [message]\nUse {name} for member name', msg);
    const group = await getGroup(jid);
    group.welcomeMsg = text; group.welcome = true;
    await group.save();
    return sendText(sock, jid, `✅ Welcome message set!\nPreview: ${text.replace('{name}', 'NewMember')}`, msg);
  },

  antilink: async ({ sock, jid, isGroup, isAdmin, args, msg }) => {
    if (!isGroup) return sendText(sock, jid, '❌ Group only!', msg);
    if (!isAdmin) return sendText(sock, jid, '❌ Admins only!', msg);
    const group = await getGroup(jid);
    const on = args[0]?.toLowerCase() === 'on';
    group.antilink = on; await group.save();
    return sendText(sock, jid, `🔗 Anti-link *${on ? 'ENABLED' : 'DISABLED'}*`, msg);
  },

  antispam: async ({ sock, jid, isGroup, isAdmin, args, msg }) => {
    if (!isGroup) return sendText(sock, jid, '❌ Group only!', msg);
    if (!isAdmin) return sendText(sock, jid, '❌ Admins only!', msg);
    const group = await getGroup(jid);
    const on = args[0]?.toLowerCase() === 'on';
    group.antispam = on; await group.save();
    return sendText(sock, jid, `🛡️ Anti-spam *${on ? 'ENABLED' : 'DISABLED'}*`, msg);
  },

  poll: async ({ sock, jid, isGroup, text, msg }) => {
    if (!isGroup) return sendText(sock, jid, '❌ Group only!', msg);
    if (!text) return sendText(sock, jid, '📊 Usage: .poll [question] | [option1] | [option2]', msg);
    const parts = text.split('|').map(s => s.trim());
    const question = parts[0];
    const options = parts.slice(1);
    if (options.length < 2) return sendText(sock, jid, '❌ Need at least 2 options!\nExample: .poll Best language? | JavaScript | Python | Rust', msg);
    try {
      await sock.sendMessage(jid, {
        poll: { name: question, values: options, selectableCount: 1 }
      });
    } catch {
      const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
      const rows = options.map((o, i) => `${emojis[i]} ${o}`).join('\n');
      return sendText(sock, jid, `📊 *POLL: ${question}*\n\n${rows}\n\nReact with the number of your choice!`, msg);
    }
  },
};
