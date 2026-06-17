import { sendText } from '../lib/sender.js';
import { randomInt, randomItem, sleep } from '../lib/utils.js';
import { getUser } from '../database/db.js';

const activeGames = new Map();

const triviaQuestions = [
  { q: 'What is the capital of Kenya?', a: 'nairobi', hint: 'It starts with N' },
  { q: 'How many continents are there?', a: '7', hint: 'Single digit number' },
  { q: 'What is 15 × 15?', a: '225', hint: 'Its between 200 and 250' },
  { q: 'Who invented the telephone?', a: 'alexander graham bell', hint: 'First name is Alexander' },
  { q: 'What planet is closest to the sun?', a: 'mercury', hint: 'Starts with M' },
  { q: 'How many sides does a hexagon have?', a: '6', hint: 'Less than 10' },
  { q: 'What is the largest ocean?', a: 'pacific', hint: 'Starts with P' },
  { q: 'What year did World War 2 end?', a: '1945', hint: 'Mid 1940s' },
  { q: 'What is the chemical symbol for gold?', a: 'au', hint: '2 letters' },
  { q: 'Who wrote Romeo and Juliet?', a: 'shakespeare', hint: 'Famous English playwright' },
  { q: 'What is the fastest land animal?', a: 'cheetah', hint: 'A spotted big cat' },
  { q: 'How many bones in the human body?', a: '206', hint: 'Between 200 and 210' },
  { q: 'What language has the most native speakers?', a: 'mandarin', hint: 'Chinese language' },
  { q: 'What is the square root of 144?', a: '12', hint: 'A dozen' },
  { q: 'Which country has the largest population?', a: 'india', hint: 'South Asian country' },
];

const truths = [
  'What is your biggest fear?',
  'Have you ever lied to your best friend?',
  'What is the most embarrassing thing you have done?',
  'Who was your first crush?',
  'What is your biggest regret?',
  'Have you ever cheated on a test?',
  'What is your most annoying habit?',
  'What is something you have never told anyone?',
  'Have you ever broken someone\'s heart?',
  'What is the most childish thing you still do?',
];

const dares = [
  'Send a voice note saying "I am the best dancer in the world"',
  'Change your status to "I love Smiley Cymor Bot" for 1 hour',
  'Send a selfie with a funny face',
  'Text your crush "hello" right now',
  'Do 20 pushups and send a voice note counting them',
  'Send a voice note singing Happy Birthday',
  'Text your mom "I miss you" right now',
  'Change your profile picture to a meme for 30 minutes',
  'Send a voice note of you speaking in an accent',
  'Text your best friend "we need to talk" then say just kidding',
];

const eightBallResponses = [
  '✅ It is certain', '✅ Without a doubt', '✅ Yes definitely',
  '✅ You may rely on it', '✅ As I see it, yes', '✅ Most likely',
  '🤔 Reply hazy, try again', '🤔 Ask again later', '🤔 Better not tell you now',
  '🤔 Cannot predict now', '🤔 Concentrate and ask again',
  '❌ Don\'t count on it', '❌ My reply is no', '❌ My sources say no',
  '❌ Outlook not so good', '❌ Very doubtful',
];

const hangmanWords = [
  'javascript', 'whatsapp', 'technology', 'programming', 'kenya',
  'nairobi', 'computer', 'blockchain', 'artificial', 'intelligence',
  'football', 'elephant', 'astronomy', 'photography', 'adventure',
];

export const gameCommands = {
  trivia: async ({ sock, jid, sender, msg }) => {
    const q = randomItem(triviaQuestions);
    activeGames.set(`trivia:${sender}`, { answer: q.a, hint: q.hint, timeout: Date.now() + 30000 });
    setTimeout(() => {
      const game = activeGames.get(`trivia:${sender}`);
      if (game) {
        activeGames.delete(`trivia:${sender}`);
        sendText(sock, jid, `⏰ Time's up! The answer was: *${q.a}*`);
      }
    }, 30000);
    return sendText(sock, jid, `🧠 *TRIVIA TIME!*\n\n❓ ${q.q}\n\n⏰ You have 30 seconds!\n💡 Type .hint for a clue\n\n_Reply with your answer_`, msg);
  },

  hint: async ({ sock, jid, sender, msg }) => {
    const game = activeGames.get(`trivia:${sender}`);
    if (!game) return sendText(sock, jid, '❌ No active trivia. Start one with .trivia', msg);
    return sendText(sock, jid, `💡 *Hint:* ${game.hint}`, msg);
  },

  rps: async ({ sock, jid, text, sender, msg }) => {
    const choices = ['rock', 'paper', 'scissors'];
    const userChoice = text?.toLowerCase();
    if (!choices.includes(userChoice)) return sendText(sock, jid, '✊ Usage: .rps [rock/paper/scissors]', msg);
    const botChoice = randomItem(choices);
    const emojis = { rock: '✊', paper: '✋', scissors: '✌️' };
    let result;
    if (userChoice === botChoice) result = "🤝 It's a *tie*!";
    else if ((userChoice === 'rock' && botChoice === 'scissors') || (userChoice === 'paper' && botChoice === 'rock') || (userChoice === 'scissors' && botChoice === 'paper')) result = '🏆 You *win*!';
    else result = '😈 Bot *wins*!';

    const user = await getUser(sender);
    user.stats.gamesPlayed++;
    if (result.includes('win*!') && !result.includes('Bot')) user.stats.gamesWon++;
    await user.save();

    return sendText(sock, jid, `🎮 *Rock Paper Scissors*\n\nYou: ${emojis[userChoice]} ${userChoice}\nBot: ${emojis[botChoice]} ${botChoice}\n\n${result}`, msg);
  },

  dice: async ({ sock, jid, sender, args, msg }) => {
    const bet = parseInt(args[0]) || 50;
    const user = await getUser(sender);
    if (user.coins < bet) return sendText(sock, jid, `❌ Not enough coins! You have *${user.coins}* coins.`, msg);
    const userRoll = randomInt(1, 6);
    const botRoll = randomInt(1, 6);
    let outcome;
    if (userRoll > botRoll) {
      user.coins += bet;
      outcome = `🎉 You win! +${bet} coins`;
    } else if (userRoll < botRoll) {
      user.coins -= bet;
      outcome = `😢 You lose! -${bet} coins`;
    } else {
      outcome = `🤝 Tie! No coins lost`;
    }
    await user.save();
    return sendText(sock, jid, `🎲 *DICE ROLL* (Bet: ${bet} coins)\n\nYou rolled: *${userRoll}*\nBot rolled: *${botRoll}*\n\n${outcome}\n💰 Balance: ${user.coins} coins`, msg);
  },

  flip: async ({ sock, jid, sender, args, msg }) => {
    const bet = parseInt(args[0]) || 0;
    const result = randomItem(['Heads', 'Tails']);
    const choice = args[1]?.toLowerCase();
    let txt = `🪙 *Coin Flip:* *${result}!*`;
    if (bet && choice && ['heads', 'tails'].includes(choice)) {
      const user = await getUser(sender);
      if (user.coins < bet) return sendText(sock, jid, `❌ Not enough coins!`, msg);
      if (choice === result.toLowerCase()) {
        user.coins += bet;
        txt += `\n\n✅ You guessed right! +${bet} coins\n💰 Balance: ${user.coins}`;
      } else {
        user.coins -= bet;
        txt += `\n\n❌ Wrong guess! -${bet} coins\n💰 Balance: ${user.coins}`;
      }
      await user.save();
    }
    return sendText(sock, jid, txt, msg);
  },

  '8ball': async ({ sock, jid, text, msg }) => {
    if (!text) return sendText(sock, jid, '🎱 Usage: .8ball [your question]', msg);
    const answer = randomItem(eightBallResponses);
    return sendText(sock, jid, `🎱 *Magic 8 Ball*\n\n❓ ${text}\n\n${answer}`, msg);
  },

  truth: async ({ sock, jid, msg }) => {
    const t = randomItem(truths);
    return sendText(sock, jid, `😳 *TRUTH:*\n\n_${t}_\n\nYou must answer honestly! 👀`, msg);
  },

  dare: async ({ sock, jid, msg }) => {
    const d = randomItem(dares);
    return sendText(sock, jid, `😈 *DARE:*\n\n_${d}_\n\nYou have to do it! 😂`, msg);
  },

  hangman: async ({ sock, jid, sender, msg }) => {
    const word = randomItem(hangmanWords);
    const display = '_ '.repeat(word.length).trim();
    activeGames.set(`hangman:${sender}`, { word, guessed: [], wrong: 0, display: word.split('').map(() => '_') });
    return sendText(sock, jid, `🪢 *HANGMAN*\n\nWord: *${display}*\nLetters: ${word.length}\n\nGuess a letter with: .guess [letter]\nWrong guesses left: 6`, msg);
  },

  guess: async ({ sock, jid, sender, text, msg }) => {
    const game = activeGames.get(`hangman:${sender}`);
    if (!game) return sendText(sock, jid, '❌ No active hangman. Start with .hangman', msg);
    const letter = text?.toLowerCase()[0];
    if (!letter || !/[a-z]/.test(letter)) return sendText(sock, jid, '❌ Guess a valid letter!', msg);
    if (game.guessed.includes(letter)) return sendText(sock, jid, `⚠️ Already guessed: *${letter}*`, msg);
    game.guessed.push(letter);
    const heads = ['😵‍💫', '😟', '😰', '😱', '💀', '☠️'];
    if (game.word.includes(letter)) {
      game.word.split('').forEach((c, i) => { if (c === letter) game.display[i] = letter; });
      if (!game.display.includes('_')) {
        activeGames.delete(`hangman:${sender}`);
        const user = await getUser(sender);
        user.coins += 100; user.stats.gamesWon++; user.stats.gamesPlayed++;
        await user.save();
        return sendText(sock, jid, `🎉 *YOU WIN!* The word was *${game.word}*!\n+100 coins earned! 💰`, msg);
      }
      return sendText(sock, jid, `✅ Good guess!\n\nWord: *${game.display.join(' ')}*\nGuessed: ${game.guessed.join(', ')}`, msg);
    } else {
      game.wrong++;
      if (game.wrong >= 6) {
        activeGames.delete(`hangman:${sender}`);
        const user = await getUser(sender);
        user.stats.gamesPlayed++;
        await user.save();
        return sendText(sock, jid, `☠️ *GAME OVER!* The word was *${game.word}*`, msg);
      }
      return sendText(sock, jid, `${heads[game.wrong - 1]} Wrong! *${letter}* is not in the word\n\nWord: *${game.display.join(' ')}*\nWrong guesses left: ${6 - game.wrong}\nGuessed: ${game.guessed.join(', ')}`, msg);
    }
  },

  slots: async ({ sock, jid, sender, args, msg }) => {
    const bet = parseInt(args[0]) || 50;
    const user = await getUser(sender);
    if (user.coins < bet) return sendText(sock, jid, `❌ Not enough coins! You have ${user.coins}`, msg);
    const symbols = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'];
    const spin = [randomItem(symbols), randomItem(symbols), randomItem(symbols)];
    let win = 0;
    if (spin[0] === spin[1] && spin[1] === spin[2]) {
      win = spin[0] === '💎' ? bet * 10 : spin[0] === '7️⃣' ? bet * 7 : bet * 5;
    } else if (spin[0] === spin[1] || spin[1] === spin[2] || spin[0] === spin[2]) {
      win = bet;
    } else {
      win = -bet;
    }
    user.coins += win;
    user.stats.gamesPlayed++;
    await user.save();
    const result = win > 0 ? `🎉 You win *${win}* coins!` : win === 0 ? `😐 Break even!` : `😢 You lost *${Math.abs(win)}* coins`;
    return sendText(sock, jid, `🎰 *SLOT MACHINE* (Bet: ${bet})\n\n[ ${spin.join(' | ')} ]\n\n${result}\n💰 Balance: ${user.coins} coins`, msg);
  },

  casino: async ({ sock, jid, sender, args, msg }) => {
    const bet = parseInt(args[0]);
    if (!bet || bet < 10) return sendText(sock, jid, '🎰 Usage: .casino [amount]\nMinimum bet: 10 coins', msg);
    const user = await getUser(sender);
    if (user.coins < bet) return sendText(sock, jid, `❌ Not enough coins! You have ${user.coins}`, msg);
    const roll = randomInt(1, 100);
    let result;
    if (roll <= 45) { user.coins -= bet; result = `😢 Lost! (-${bet}) Roll: ${roll}`; }
    else if (roll <= 70) { user.coins += bet; result = `✅ Win! (+${bet}) Roll: ${roll}`; }
    else if (roll <= 85) { const w = bet * 2; user.coins += w; result = `🔥 Big Win! (+${w}) Roll: ${roll}`; }
    else { const w = bet * 5; user.coins += w; result = `💥 JACKPOT! (+${w}) Roll: ${roll}`; }
    user.stats.gamesPlayed++;
    await user.save();
    return sendText(sock, jid, `🎰 *CASINO*\n\n${result}\n💰 Balance: ${user.coins} coins`, msg);
  },

  checkTrivia: async (sock, jid, sender, text) => {
    const game = activeGames.get(`trivia:${sender}`);
    if (!game) return false;
    if (Date.now() > game.timeout) { activeGames.delete(`trivia:${sender}`); return false; }
    if (text.toLowerCase().includes(game.answer)) {
      activeGames.delete(`trivia:${sender}`);
      const user = await getUser(sender);
      user.coins += 75; user.xp += 50; user.stats.gamesWon++; user.stats.gamesPlayed++;
      await user.save();
      await sendText(sock, jid, `✅ *CORRECT!* 🎉\nAnswer: *${game.answer}*\n+75 coins & +50 XP earned!`);
      return true;
    }
    return false;
  }
};
