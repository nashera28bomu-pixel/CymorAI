import { askGroq, clearContext, generateRoast, generateRizz, generateDebate, generateJoke, generateStory, generateRecipe, fixCode, translateText, summarizeText } from '../lib/groq.js';
import { sendText, sendTyping } from '../lib/sender.js';
import { checkRateLimit } from '../lib/utils.js';

export const aiCommands = {
  ask: async ({ sock, jid, text, msg, sender }) => {
    if (!text) return sendText(sock, jid, '❓ Usage: .ask [your question]', msg);
    if (!checkRateLimit(sender, 'ask', 2000)) return sendText(sock, jid, '⏳ Slow down! Wait a moment.', msg);
    await sendTyping(sock, jid, 1500);
    const reply = await askGroq(text, sender);
    return sendText(sock, jid, `🤖 *Smiley AI:*\n\n${reply}`, msg);
  },

  roast: async ({ sock, jid, text, msg, args, pushName }) => {
    const name = args[0]?.replace('@', '') || pushName || 'you';
    await sendTyping(sock, jid, 2000);
    const roast = await generateRoast(name);
    return sendText(sock, jid, `🔥 *Roast for ${name}:*\n\n${roast}`, msg);
  },

  rizz: async ({ sock, jid, args, msg }) => {
    const gender = args[0] || 'her';
    await sendTyping(sock, jid, 1500);
    const line = await generateRizz(gender);
    return sendText(sock, jid, `😏 *Rizz Line:*\n\n_${line}_`, msg);
  },

  debate: async ({ sock, jid, text, msg }) => {
    if (!text) return sendText(sock, jid, '⚖️ Usage: .debate [topic]', msg);
    await sendTyping(sock, jid, 2000);
    const debate = await generateDebate(text);
    return sendText(sock, jid, `⚖️ *Debate: ${text}*\n\n${debate}`, msg);
  },

  story: async ({ sock, jid, text, msg }) => {
    if (!text) return sendText(sock, jid, '📖 Usage: .story [prompt]', msg);
    await sendTyping(sock, jid, 2000);
    const story = await generateStory(text);
    return sendText(sock, jid, `📖 *Story:*\n\n${story}`, msg);
  },

  joke: async ({ sock, jid, msg }) => {
    await sendTyping(sock, jid, 1000);
    const joke = await generateJoke();
    return sendText(sock, jid, `😂 *Joke:*\n\n${joke}`, msg);
  },

  recipe: async ({ sock, jid, text, msg }) => {
    if (!text) return sendText(sock, jid, '🍳 Usage: .recipe [dish name]', msg);
    await sendTyping(sock, jid, 2000);
    const recipe = await generateRecipe(text);
    return sendText(sock, jid, `🍳 *Recipe: ${text}*\n\n${recipe}`, msg);
  },

  fixcode: async ({ sock, jid, text, msg }) => {
    if (!text) return sendText(sock, jid, '🔧 Usage: .fixcode [paste your code]', msg);
    await sendTyping(sock, jid, 3000);
    const fixed = await fixCode(text);
    return sendText(sock, jid, `🔧 *Code Fix:*\n\n${fixed}`, msg);
  },

  translate: async ({ sock, jid, args, msg }) => {
    if (args.length < 2) return sendText(sock, jid, '🌍 Usage: .translate [language] [text]\nExample: .translate French Hello world', msg);
    const lang = args[0];
    const text = args.slice(1).join(' ');
    await sendTyping(sock, jid, 1500);
    const translated = await translateText(text, lang);
    return sendText(sock, jid, `🌍 *Translation (${lang}):*\n\n${translated}`, msg);
  },

  summarize: async ({ sock, jid, text, msg }) => {
    if (!text) return sendText(sock, jid, '📝 Usage: .summarize [long text]', msg);
    await sendTyping(sock, jid, 2000);
    const summary = await summarizeText(text);
    return sendText(sock, jid, `📝 *Summary:*\n\n${summary}`, msg);
  },

  clear: async ({ sock, jid, sender, msg }) => {
    clearContext(sender);
    return sendText(sock, jid, '🧹 AI memory cleared! Starting fresh.', msg);
  },

  imagine: async ({ sock, jid, text, msg }) => {
    if (!text) return sendText(sock, jid, '🎨 Usage: .imagine [describe what you want]', msg);
    await sendTyping(sock, jid, 1000);
    const desc = await askGroq(`Describe in vivid visual detail what this would look like as a painting or photo: "${text}". Make it poetic and descriptive.`);
    return sendText(sock, jid, `🎨 *Visual Imagination:*\n_"${text}"_\n\n${desc}\n\n_🖼️ Tip: Use this description with an AI image tool like DALL-E or Midjourney_`, msg);
  },
};
