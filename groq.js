import Groq from 'groq-sdk';
import { config } from '../config.js';

const groq = new Groq({ apiKey: config.groqKey });

const userContexts = new Map(); // per-user chat memory

export async function askGroq(prompt, jid = null, systemPrompt = null) {
  try {
    const system = systemPrompt || `You are Smiley Cymor Bot, a powerful and friendly WhatsApp assistant created by the Legendary Smiley Cymor under Cymor Tech Services. Be helpful, witty, and concise. Keep responses under 500 words unless asked otherwise.`;

    const messages = [];
    if (jid && userContexts.has(jid)) {
      messages.push(...userContexts.get(jid).slice(-6)); // last 6 messages
    }
    messages.push({ role: 'user', content: prompt });

    const res = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens: 800,
      temperature: 0.8,
    });

    const reply = res.choices[0]?.message?.content || 'No response.';

    // Save context
    if (jid) {
      const ctx = userContexts.get(jid) || [];
      ctx.push({ role: 'user', content: prompt });
      ctx.push({ role: 'assistant', content: reply });
      if (ctx.length > 20) ctx.splice(0, 2); // keep last 10 exchanges
      userContexts.set(jid, ctx);
    }

    return reply;
  } catch (err) {
    return `❌ AI Error: ${err.message}`;
  }
}

export function clearContext(jid) {
  userContexts.delete(jid);
}

export async function generateRoast(name) {
  return askGroq(`Generate a hilarious, savage but friendly roast for someone named "${name}". Keep it under 4 sentences. Be creative and funny.`);
}

export async function generateRizz(gender = 'her') {
  return askGroq(`Generate a smooth, charming pickup line to say to ${gender}. Make it clever and original.`);
}

export async function generateDebate(topic) {
  return askGroq(`Give me both sides of a debate on: "${topic}". Format as FOR: and AGAINST:. Be persuasive on both sides.`);
}

export async function generateJoke() {
  return askGroq(`Tell me a fresh, funny joke. Make it clever and original. Just give the joke, no intro.`);
}

export async function generateStory(prompt) {
  return askGroq(`Write a short creative story (4-6 sentences) based on: "${prompt}". Make it engaging.`);
}

export async function generateLyrics(song, artist) {
  return askGroq(`Write original song lyrics inspired by the style of "${song}" by ${artist}. Include a chorus and 2 verses. Make them creative.`);
}

export async function translateText(text, lang) {
  return askGroq(`Translate the following text to ${lang}. Only return the translation, nothing else:\n\n${text}`);
}

export async function summarizeText(text) {
  return askGroq(`Summarize this text in 3-5 bullet points:\n\n${text}`);
}

export async function fixCode(code) {
  return askGroq(`Debug and fix this code. Explain what was wrong briefly then show the fixed version:\n\n${code}`);
}

export async function generateRecipe(dish) {
  return askGroq(`Give me a quick recipe for "${dish}". Include ingredients and steps. Keep it concise.`);
}
