import { sendText, sendSticker, sendImage, sendAudio, sendVideo } from '../lib/sender.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, '../tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

async function downloadMedia(msg) {
  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    return buffer;
  } catch {
    return null;
  }
}

async function bufferToWebp(buffer, isVideo = false) {
  const id = Date.now();
  const inFile = path.join(tmpDir, `in_${id}.${isVideo ? 'mp4' : 'png'}`);
  const outFile = path.join(tmpDir, `out_${id}.webp`);
  fs.writeFileSync(inFile, buffer);
  try {
    if (isVideo) {
      execSync(`ffmpeg -i "${inFile}" -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15" -vcodec libwebp -lossless 0 -compression_level 6 -loop 0 -preset default -an -vsync 0 -t 6 "${outFile}" -y`);
    } else {
      execSync(`ffmpeg -i "${inFile}" -vf "scale=512:512:force_original_aspect_ratio=decrease" "${outFile}" -y`);
    }
    const result = fs.readFileSync(outFile);
    return result;
  } catch (e) {
    return null;
  } finally {
    if (fs.existsSync(inFile)) fs.unlinkSync(inFile);
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
  }
}

export const mediaCommands = {
  sticker: async ({ sock, jid, msg, quoted }) => {
    const target = quoted || msg;
    const type = target?.message?.imageMessage ? 'image' : target?.message?.videoMessage ? 'video' : target?.message?.stickerMessage ? 'sticker' : null;
    if (!type) return sendText(sock, jid, '🖼️ Reply to an image or video to make a sticker!', msg);
    const buffer = await downloadMedia(target);
    if (!buffer) return sendText(sock, jid, '❌ Could not download media.', msg);
    await sendText(sock, jid, '⏳ Creating sticker...');
    const webp = await bufferToWebp(buffer, type === 'video');
    if (!webp) return sendText(sock, jid, '❌ Failed to convert. Make sure ffmpeg is installed.', msg);
    return sendSticker(sock, jid, webp, msg);
  },

  toimg: async ({ sock, jid, msg, quoted }) => {
    const target = quoted || msg;
    if (!target?.message?.stickerMessage) return sendText(sock, jid, '🖼️ Reply to a sticker to convert it to image!', msg);
    const buffer = await downloadMedia(target);
    if (!buffer) return sendText(sock, jid, '❌ Could not download sticker.', msg);
    const id = Date.now();
    const inFile = path.join(tmpDir, `sticker_${id}.webp`);
    const outFile = path.join(tmpDir, `img_${id}.png`);
    fs.writeFileSync(inFile, buffer);
    try {
      execSync(`ffmpeg -i "${inFile}" "${outFile}" -y`);
      const img = fs.readFileSync(outFile);
      return sendImage(sock, jid, img, '🖼️ Here is your image!', msg);
    } catch {
      return sendText(sock, jid, '❌ Conversion failed.', msg);
    } finally {
      if (fs.existsSync(inFile)) fs.unlinkSync(inFile);
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    }
  },

  vv: async ({ sock, jid, msg, quoted }) => {
    const target = quoted || msg;
    const viewOnce = target?.message?.viewOnceMessage || target?.message?.viewOnceMessageV2;
    if (!viewOnce) return sendText(sock, jid, '👁️ Reply to a view once message to save it!', msg);
    const inner = viewOnce.message;
    const type = inner?.imageMessage ? 'image' : inner?.videoMessage ? 'video' : inner?.audioMessage ? 'audio' : null;
    if (!type) return sendText(sock, jid, '❌ Unsupported view once type.', msg);
    const fakeMsg = { ...target, message: inner };
    const buffer = await downloadMedia(fakeMsg);
    if (!buffer) return sendText(sock, jid, '❌ Could not retrieve view once content.', msg);
    if (type === 'image') return sendImage(sock, jid, buffer, '👁️ *View Once Saved!*', msg);
    if (type === 'video') return sendVideo(sock, jid, buffer, '👁️ *View Once Saved!*');
    if (type === 'audio') return sendAudio(sock, jid, buffer);
  },

  gif: async ({ sock, jid, msg, quoted }) => {
    const target = quoted || msg;
    if (!target?.message?.videoMessage) return sendText(sock, jid, '🎬 Reply to a video to convert to GIF!', msg);
    const buffer = await downloadMedia(target);
    if (!buffer) return sendText(sock, jid, '❌ Could not download video.', msg);
    const id = Date.now();
    const inFile = path.join(tmpDir, `vid_${id}.mp4`);
    const outFile = path.join(tmpDir, `gif_${id}.gif`);
    fs.writeFileSync(inFile, buffer);
    await sendText(sock, jid, '⏳ Converting to GIF...');
    try {
      execSync(`ffmpeg -i "${inFile}" -vf "scale=320:-1:flags=lanczos,fps=10" -t 6 "${outFile}" -y`);
      const gif = fs.readFileSync(outFile);
      return sendImage(sock, jid, gif, '🎬 Here is your GIF!', msg);
    } catch {
      return sendText(sock, jid, '❌ GIF conversion failed.', msg);
    } finally {
      if (fs.existsSync(inFile)) fs.unlinkSync(inFile);
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    }
  },

  tiktok: async ({ sock, jid, text, msg }) => {
    if (!text || !text.includes('tiktok')) return sendText(sock, jid, '🎵 Usage: .tiktok [tiktok url]', msg);
    await sendText(sock, jid, '⏳ Downloading TikTok...');
    try {
      const res = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(text)}`, { timeout: 15000 });
      const data = res.data;
      const videoUrl = data?.video?.noWatermark || data?.video?.watermark;
      if (!videoUrl) return sendText(sock, jid, '❌ Could not fetch TikTok video.', msg);
      const videoRes = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 30000 });
      const buffer = Buffer.from(videoRes.data);
      return sendVideo(sock, jid, buffer, `🎵 ${data?.title || 'TikTok Video'}\n\n> 🤖 Smiley Cymor Bot`);
    } catch (e) {
      return sendText(sock, jid, `❌ TikTok download failed: ${e.message}`, msg);
    }
  },

  ig: async ({ sock, jid, text, msg }) => {
    if (!text || !text.includes('instagram')) return sendText(sock, jid, '📸 Usage: .ig [instagram url]', msg);
    await sendText(sock, jid, '⏳ Downloading Instagram content...');
    try {
      const res = await axios.get(`https://api.instagramdl.info/api?url=${encodeURIComponent(text)}`, { timeout: 15000 });
      const url = res.data?.data?.[0]?.url;
      if (!url) return sendText(sock, jid, '❌ Could not fetch Instagram content.', msg);
      const mediaRes = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
      const buffer = Buffer.from(mediaRes.data);
      const isVideo = url.includes('.mp4');
      if (isVideo) return sendVideo(sock, jid, buffer, '📸 Instagram Video\n\n> 🤖 Smiley Cymor Bot');
      return sendImage(sock, jid, buffer, '📸 Instagram Image\n\n> 🤖 Smiley Cymor Bot', msg);
    } catch (e) {
      return sendText(sock, jid, `❌ Instagram download failed: ${e.message}`, msg);
    }
  },

  play: async ({ sock, jid, text, msg }) => {
    if (!text) return sendText(sock, jid, '🎵 Usage: .play [song name]', msg);
    await sendText(sock, jid, `🎵 Searching for *${text}*...`);
    try {
      const searchRes = await axios.get(`https://ytapi.cc/api/?s=${encodeURIComponent(text)}&mode=search`, { timeout: 15000 });
      const video = searchRes.data?.[0];
      if (!video) return sendText(sock, jid, '❌ Song not found.', msg);
      const dlRes = await axios.get(`https://ytapi.cc/api/?id=${video.id}&mode=mp3`, { timeout: 30000 });
      const audioUrl = dlRes.data?.url;
      if (!audioUrl) return sendText(sock, jid, '❌ Could not get audio URL.', msg);
      const audioRes = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 60000 });
      const buffer = Buffer.from(audioRes.data);
      await sendAudio(sock, jid, buffer, false);
      return sendText(sock, jid, `🎵 *${video.title || text}*\n⏱️ ${video.duration || 'Unknown'}\n\n> 🤖 Smiley Cymor Bot`);
    } catch (e) {
      return sendText(sock, jid, `❌ Failed: ${e.message}. Try .play with exact song name.`, msg);
    }
  },
};
