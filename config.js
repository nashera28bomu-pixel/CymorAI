import dotenv from 'dotenv';
dotenv.config();

export const config = {
  ownerNumber: process.env.OWNER_NUMBER || '254XXXXXXXXX',
  supportNumber: process.env.SUPPORT_NUMBER || '254784074568',
  botName: process.env.BOT_NAME || 'Smiley Cymor Bot',
  prefixes: ['.', '!', '/', '#'],
  mongoUri: process.env.MONGO_URI,
  groqKey: process.env.GROQ_API_KEY,
  sessionId: process.env.SESSION_ID || '',
  port: parseInt(process.env.PORT) || 3000,
  adminPassword: process.env.ADMIN_PASSWORD || 'CymorAdmin2024',
  version: '2.0.0',
  author: 'Legendary Smiley Cymor',
  footer: '🤖 Powered by Cymor Tech Services',
  website: 'https://cymortechservices.com',
  supportLink: 'https://wa.me/254784074568',
};

export const ownerJid = `${config.ownerNumber}@s.whatsapp.net`;
