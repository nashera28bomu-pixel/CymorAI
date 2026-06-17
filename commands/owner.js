import { sendText, broadcastMessage } from '../lib/sender.js';
import { getUser, User, Subscriber, BotStats, getTodayStats } from '../database/db.js';
import { isOwner, formatNumber } from '../lib/utils.js';
import { config } from '../config.js';

export const ownerCommands = {
  broadcast: async ({ sock, jid, text, sender, msg }) => {
    if (!isOwner(sender)) return sendText(sock, jid, '❌ Owner only command!', msg);
    if (!text) return sendText(sock, jid, '📢 Usage: .broadcast [message]', msg);
    await sendText(sock, jid, '📢 Broadcasting to all subscribers...');
    const subs = await Subscriber.find({});
    if (!subs.length) return sendText(sock, jid, '❌ No subscribers yet!', msg);
    const jids = subs.map(s => s.jid);
    const broadcastText = `📢 *Broadcast from Smiley Cymor Bot*\n\n${text}\n\n> 🤖 Powered by Cymor Tech Services`;
    const results = await broadcastMessage(sock, jids, broadcastText);
    return sendText(sock, jid, `✅ Broadcast complete!\n📤 Sent: ${results.sent}\n❌ Failed: ${results.failed}`, msg);
  },

  ban: async ({ sock, jid, sender, mentionedJids, args, msg }) => {
    if (!isOwner(sender)) return sendText(sock, jid, '❌ Owner only!', msg);
    const target = mentionedJids?.[0] || `${args[0]?.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    if (!target) return sendText(sock, jid, '❌ Tag or provide number: .ban @user', msg);
    const user = await getUser(target);
    user.role = 'banned'; await user.save();
    return sendText(sock, jid, `🚫 Banned ${target.split('@')[0]}`, msg);
  },

  unban: async ({ sock, jid, sender, mentionedJids, args, msg }) => {
    if (!isOwner(sender)) return sendText(sock, jid, '❌ Owner only!', msg);
    const target = mentionedJids?.[0] || `${args[0]?.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    const user = await getUser(target);
    user.role = 'user'; await user.save();
    return sendText(sock, jid, `✅ Unbanned ${target.split('@')[0]}`, msg);
  },

  addpremium: async ({ sock, jid, sender, mentionedJids, msg }) => {
    if (!isOwner(sender)) return sendText(sock, jid, '❌ Owner only!', msg);
    if (!mentionedJids?.length) return sendText(sock, jid, '❌ Tag someone: .addpremium @user', msg);
    for (const t of mentionedJids) {
      const user = await getUser(t);
      user.role = 'premium'; await user.save();
    }
    return sendText(sock, jid, `⭐ Premium granted to ${mentionedJids.length} user(s)!`, msg);
  },

  addvip: async ({ sock, jid, sender, mentionedJids, msg }) => {
    if (!isOwner(sender)) return sendText(sock, jid, '❌ Owner only!', msg);
    if (!mentionedJids?.length) return sendText(sock, jid, '❌ Tag someone: .addvip @user', msg);
    for (const t of mentionedJids) {
      const user = await getUser(t);
      user.role = 'vip'; await user.save();
    }
    return sendText(sock, jid, `💎 VIP granted to ${mentionedJids.length} user(s)!`, msg);
  },

  give: async ({ sock, jid, sender, mentionedJids, args, msg }) => {
    if (!isOwner(sender)) return sendText(sock, jid, '❌ Owner only!', msg);
    const amount = parseInt(args[args.length - 1]);
    if (!mentionedJids?.length || !amount) return sendText(sock, jid, '❌ Usage: .give @user [amount]', msg);
    for (const t of mentionedJids) {
      const user = await getUser(t);
      user.coins += amount; await user.save();
    }
    return sendText(sock, jid, `✅ Gave ${amount} coins to ${mentionedJids.length} user(s)!`, msg);
  },

  stats: async ({ sock, jid, sender, msg }) => {
    if (!isOwner(sender)) return sendText(sock, jid, '❌ Owner only!', msg);
    const today = await getTodayStats();
    const totalUsers = await User.countDocuments();
    const premiumUsers = await User.countDocuments({ role: 'premium' });
    const vipUsers = await User.countDocuments({ role: 'vip' });
    const bannedUsers = await User.countDocuments({ role: 'banned' });
    const subs = await Subscriber.countDocuments();
    return sendText(sock, jid, `📊 *Bot Statistics*\n${'─'.repeat(28)}\n👥 Total Users: ${formatNumber(totalUsers)}\n⭐ Premium: ${premiumUsers}\n💎 VIP: ${vipUsers}\n🚫 Banned: ${bannedUsers}\n📢 Subscribers: ${subs}\n\n📅 *Today*\n💬 Commands Run: ${today.commandsRun}\n📨 Messages: ${today.messagesReceived}\n👤 Active Users: ${today.activeUsers.length}\n❌ Errors: ${today.errors}`, msg);
  },

  restart: async ({ sock, jid, sender, msg }) => {
    if (!isOwner(sender)) return sendText(sock, jid, '❌ Owner only!', msg);
    await sendText(sock, jid, '🔄 Restarting bot...', msg);
    setTimeout(() => process.exit(0), 1000);
  },

  setname: async ({ sock, jid, sender, text, msg }) => {
    if (!isOwner(sender)) return sendText(sock, jid, '❌ Owner only!', msg);
    if (!text) return sendText(sock, jid, '❌ Usage: .setname [name]', msg);
    try {
      await sock.updateProfileName(text);
      return sendText(sock, jid, `✅ Bot name updated to: *${text}*`, msg);
    } catch {
      return sendText(sock, jid, '❌ Failed to update name.', msg);
    }
  },

  setstatus: async ({ sock, jid, sender, text, msg }) => {
    if (!isOwner(sender)) return sendText(sock, jid, '❌ Owner only!', msg);
    if (!text) return sendText(sock, jid, '❌ Usage: .setstatus [status text]', msg);
    try {
      await sock.updateProfileStatus(text);
      return sendText(sock, jid, `✅ Status updated!`, msg);
    } catch {
      return sendText(sock, jid, '❌ Failed to update status.', msg);
    }
  },

  allusers: async ({ sock, jid, sender, msg }) => {
    if (!isOwner(sender)) return sendText(sock, jid, '❌ Owner only!', msg);
    const users = await User.find({}).limit(20).sort({ joinedAt: -1 });
    const list = users.map((u, i) => `${i + 1}. ${u.name || u.jid.split('@')[0]} [${u.role}]`).join('\n');
    return sendText(sock, jid, `👥 *Recent Users (${users.length})*\n\n${list}`, msg);
  },
};
