// ================================
// MESSAGE HANDLER
// ================================

export async function handleMessage(sock, m) {
  try {
    const msg = m.messages?.[0];

    console.log('📩 MESSAGE RECEIVED');
    console.log('FROMME:', msg?.key?.fromMe);

    if (!msg) return;

    const jid = msg.key.remoteJid;
    const isGroup = jid?.endsWith('@g.us');

    const sender = isGroup
      ? msg.key.participant
      : jid;

    if (!sender) return;

    const pushName =
      msg.pushName ||
      sender.split('@')[0];

    const senderClean = cleanJid(sender);

    const content = msg.message;
    if (!content) return;

    const text =
      content.conversation ||
      content.extendedTextMessage?.text ||
      content.imageMessage?.caption ||
      content.videoMessage?.caption ||
      '';

    console.log('TEXT:', text);

    const quoted =
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        ? {
            message:
              msg.message.extendedTextMessage.contextInfo
                .quotedMessage,
            key: {
              remoteJid: jid,
              id: msg.message.extendedTextMessage
                .contextInfo.stanzaId,
              participant:
                msg.message.extendedTextMessage
                  .contextInfo.participant,
            },
          }
        : null;

    const mentionedJids =
      content.extendedTextMessage?.contextInfo
        ?.mentionedJid || [];

    // ================================
    // STATS
    // ================================

    const stats = await getTodayStats();

    stats.messagesReceived++;

    if (!stats.activeUsers.includes(senderClean)) {
      stats.activeUsers.push(senderClean);
    }

    stats.save().catch(() => {});

    // ================================
    // USER
    // ================================

    const user = await getUser(
      senderClean,
      pushName
    );

    if (user.role === 'banned') {
      return;
    }

    user.xp += 2;
    user.messageCount++;
    user.lastSeen = new Date();

    const newLevel = getLevelFromXP(user.xp);

    if (newLevel > user.level) {
      user.level = newLevel;
      user.coins += 500;

      await sendText(
        sock,
        jid,
        `🎉 *Level Up!* @${senderClean}\n\n🏆 You reached Level *${newLevel}*!\n+500 bonus coins! 🪙`
      );
    }

    user.save().catch(() => {});

    // ================================
    // AUTO SUBSCRIBE
    // ================================

    Subscriber.findOneAndUpdate(
      { jid: senderClean },
      {
        jid: senderClean,
        name: pushName,
      },
      { upsert: true }
    ).catch(() => {});

    // ================================
    // PRIVACY SETTINGS
    // ================================

    const settings = getSettings(senderClean);

    if (
      settings.autoblue &&
      !isGroup
    ) {
      await sock.readMessages([
        msg.key,
      ]);
    }

    // ================================
    // ANTI SPAM
    // ================================

    if (
      isGroup &&
      isSpamming(senderClean)
    ) {
      const group = await getGroup(jid);

      if (group.antispam) {
        await sock.sendMessage(jid, {
          delete: msg.key,
        });

        return;
      }
    }

    // ================================
    // ANTI LINK
    // ================================

    if (
      isGroup &&
      (
        text.includes('https://') ||
        text.includes('http://')
      )
    ) {
      const group = await getGroup(jid);

      if (group.antilink) {
        const meta =
          await sock
            .groupMetadata(jid)
            .catch(() => null);

        const isAdmin =
          meta?.participants?.find(
            p => p.id === sender
          )?.admin;

        if (
          !isAdmin &&
          !isOwner(senderClean)
        ) {
          await sock.sendMessage(jid, {
            delete: msg.key,
          });

          await sendText(
            sock,
            jid,
            `⚠️ @${senderClean} links are not allowed in this group!`
          );

          return;
        }
      }
    }

    // ================================
    // TRIVIA ANSWERS
    // ================================

    if (
      text &&
      !parseCommand(text)
    ) {
      await gameCommands.checkTrivia(
        sock,
        jid,
        senderClean,
        text
      );
    }

    // ================================
    // COMMAND PARSE
    // ================================

    const parsed =
      parseCommand(text);

    if (!parsed) {
      return;
    }

    const {
      cmd,
      args,
      text: cmdText,
    } = parsed;

    console.log(
      `⚡ COMMAND: ${cmd}`
    );

    // ================================
    // GROUP ADMIN CHECK
    // ================================

    let isAdmin = false;
    let isBotAdmin = false;

    if (isGroup) {
      try {
        const meta =
          await sock.groupMetadata(jid);

        const botJid =
          sock.user.id.replace(
            /:.*@/,
            '@'
          );

        isAdmin =
          !!meta.participants.find(
            p => p.id === sender
          )?.admin ||
          isOwner(senderClean);

        isBotAdmin =
          !!meta.participants.find(
            p => p.id === botJid
          )?.admin;
      } catch {}
    }

    // ================================
    // CONTEXT
    // ================================

    const ctx = {
      sock,
      jid,
      sender: senderClean,
      pushName,
      args,
      text: cmdText,
      msg,
      quoted,
      isGroup,
      isAdmin,
      isBotAdmin,
      mentionedJids,
      user,
    };

    // ================================
    // MENU
    // ================================

    if (
      cmd === 'menu' ||
      cmd === 'help' ||
      cmd === 'start'
    ) {
      const menuText =
        buildMenuText(pushName);

      return await sendMenu(
        sock,
        jid,
        menuText,
        msg
      );
    }

    // ================================
    // COMMAND EXECUTION
    // ================================

    const command =
      allCommands[cmd];

    if (!command) {
      console.log(
        `❓ Unknown command: ${cmd}`
      );
      return;
    }

    stats.commandsRun++;
    stats.save().catch(() => {});

    user.stats.commandsUsed++;
    user.save().catch(() => {});

    await command(ctx);

  } catch (err) {
    console.error(
      '❌ Handler Error:',
      err
    );

    const stats =
      await getTodayStats()
        .catch(() => null);

    if (stats) {
      stats.errors++;
      stats.save().catch(() => {});
    }
  }
}
