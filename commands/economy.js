import { sendText } from '../lib/sender.js';
import { getUser, User, Subscriber } from '../database/db.js';
import { getLevelFromXP, formatNumber } from '../lib/utils.js';
import { config } from '../config.js';

const shopItems = [
  { id: 'vip_day', name: '⭐ VIP for 1 Day', price: 500, desc: 'Get VIP access for 24 hours' },
  { id: 'double_xp', name: '🚀 Double XP Boost', price: 200, desc: 'Double XP for 1 hour' },
  { id: 'lucky_charm', name: '🍀 Lucky Charm', price: 300, desc: '+20% win chance in games' },
  { id: 'ai_unlimited', name: '🤖 AI Unlimited', price: 400, desc: 'No cooldowns on AI commands' },
];

export const economyCommands = {
  daily: async ({ sock, jid, sender, pushName, msg }) => {
    const user = await getUser(sender, pushName);
    const now = new Date();
    const last = user.lastDaily;
    if (last) {
      const diff = now - last;
      if (diff < 86400000) {
        const remaining = 86400000 - diff;
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        return sendText(sock, jid, `⏳ Come back in *${h}h ${m}m* for your daily reward!`, msg);
      }
    }
    const streak = (user.lastDaily && (now - user.lastDaily) < 172800000) ? 1 : 0;
    const reward = 250 + (streak * 50);
    user.coins += reward;
    user.xp += 100;
    user.lastDaily = now;
    user.level = getLevelFromXP(user.xp);
    await user.save();
    return sendText(sock, jid, `🎁 *Daily Reward Claimed!*\n\n💰 +${reward} coins\n⭐ +100 XP\n🏆 Level: ${user.level}\n💎 Balance: ${user.coins} coins\n\n_Come back tomorrow for more!_ 🔄`, msg);
  },

  balance: async ({ sock, jid, sender, pushName, msg }) => {
    const user = await getUser(sender, pushName);
    return sendText(sock, jid, `💰 *${user.name || pushName}'s Wallet*\n\n🪙 Coins: *${formatNumber(user.coins)}*\n⭐ XP: *${formatNumber(user.xp)}*\n🏆 Level: *${user.level}*\n🎖️ Role: *${user.role.toUpperCase()}*\n📊 Commands used: *${user.stats.commandsUsed}*`, msg);
  },

  profile: async ({ sock, jid, sender, pushName, msg }) => {
    const user = await getUser(sender, pushName);
    const rank = user.role.toUpperCase();
    const wins = user.stats.gamesWon;
    const played = user.stats.gamesPlayed;
    const winRate = played ? Math.round((wins / played) * 100) : 0;
    return sendText(sock, jid, `👤 *PROFILE: ${user.name || pushName}*\n${'─'.repeat(25)}\n🎖️ Role: ${rank}\n🏆 Level: ${user.level}\n⭐ XP: ${formatNumber(user.xp)}\n💰 Coins: ${formatNumber(user.coins)}\n📊 Commands: ${user.stats.commandsUsed}\n🎮 Games: ${played} (${winRate}% wins)\n📅 Joined: ${user.joinedAt.toDateString()}\n${'─'.repeat(25)}\n\n> 🤖 Powered by Cymor Tech Services`, msg);
  },

  transfer: async ({ sock, jid, sender, args, msg, mentionedJids }) => {
    const amount = parseInt(args[args.length - 1]);
    const targetJid = mentionedJids?.[0] || (args[0]?.replace('@', '') + '@s.whatsapp.net');
    if (!targetJid || !amount || amount < 1) return sendText(sock, jid, '💸 Usage: .transfer [@user] [amount]', msg);
    if (targetJid === sender) return sendText(sock, jid, '❌ Cannot transfer to yourself!', msg);
    const from = await getUser(sender);
    if (from.coins < amount) return sendText(sock, jid, `❌ Insufficient coins! You have *${from.coins}*`, msg);
    const to = await getUser(targetJid);
    from.coins -= amount;
    to.coins += amount;
    await from.save();
    await to.save();
    return sendText(sock, jid, `✅ *Transfer Successful!*\n\n💸 Sent: ${amount} coins\n📤 From: ${from.name || 'You'}\n📥 To: ${to.name || targetJid.split('@')[0]}\n💰 Your balance: ${from.coins} coins`, msg);
  },

  leaderboard: async ({ sock, jid, msg }) => {
    const top = await User.find({ role: { $ne: 'banned' } }).sort({ coins: -1 }).limit(10);
    if (!top.length) return sendText(sock, jid, '📊 No users yet!', msg);
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const rows = top.map((u, i) => `${medals[i]} ${u.name || u.jid.split('@')[0]} — *${formatNumber(u.coins)}* coins`).join('\n');
    return sendText(sock, jid, `🏆 *RICHEST USERS*\n${'─'.repeat(28)}\n${rows}\n${'─'.repeat(28)}\n\n> 🤖 Powered by Cymor Tech Services`, msg);
  },

  shop: async ({ sock, jid, msg }) => {
    const items = shopItems.map((i, idx) => `*${idx + 1}.* ${i.name}\n   💰 ${i.price} coins — ${i.desc}`).join('\n\n');
    return sendText(sock, jid, `🛒 *SMILEY CYMOR SHOP*\n${'─'.repeat(28)}\n\n${items}\n\n${'─'.repeat(28)}\nBuy with: *.buy [item number]*`, msg);
  },

  buy: async ({ sock, jid, sender, pushName, args, msg }) => {
    const idx = parseInt(args[0]) - 1;
    const item = shopItems[idx];
    if (!item) return sendText(sock, jid, '❌ Invalid item. Check .shop for valid items.', msg);
    const user = await getUser(sender, pushName);
    if (user.coins < item.price) return sendText(sock, jid, `❌ Need *${item.price}* coins. You have *${user.coins}*`, msg);
    user.coins -= item.price;
    if (!user.inventory) user.inventory = [];
    user.inventory.push(item.id);
    await user.save();
    return sendText(sock, jid, `✅ *Purchase Successful!*\n\n${item.name} bought!\n💰 Remaining coins: ${user.coins}`, msg);
  },

  inventory: async ({ sock, jid, sender, pushName, msg }) => {
    const user = await getUser(sender, pushName);
    if (!user.inventory?.length) return sendText(sock, jid, '🎒 Your inventory is empty. Buy items with *.shop*', msg);
    const items = user.inventory.map(id => {
      const found = shopItems.find(s => s.id === id);
      return found ? `▸ ${found.name}` : `▸ ${id}`;
    }).join('\n');
    return sendText(sock, jid, `🎒 *Your Inventory*\n\n${items}\n\n> Use .shop to buy more!`, msg);
  },
};
