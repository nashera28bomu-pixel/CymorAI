import mongoose from 'mongoose';
import { config } from '../config.js';

/**
 * MongoDB Connection
 * Prevents duplicate connections from server.js and index.js
 */
export async function connectDB() {
  try {
    // Already connected
    if (mongoose.connection.readyState === 1) {
      return mongoose.connection;
    }

    // Currently connecting
    if (mongoose.connection.readyState === 2) {
      return mongoose.connection;
    }

    await mongoose.connect(config.mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log('✅ MongoDB connected');
    return mongoose.connection;

  } catch (err) {
    console.error('❌ MongoDB error:', err.message);
    process.exit(1);
  }
}

/* ──────────────────────────────────────────────
   USER SCHEMA
────────────────────────────────────────────── */
const userSchema = new mongoose.Schema({
  jid: {
    type: String,
    unique: true,
    required: true,
    index: true,
  },

  name: String,

  coins: {
    type: Number,
    default: 500,
  },

  xp: {
    type: Number,
    default: 0,
  },

  level: {
    type: Number,
    default: 1,
  },

  role: {
    type: String,
    enum: ['user', 'premium', 'vip', 'admin', 'banned'],
    default: 'user',
  },

  lastDaily: Date,
  lastSeen: Date,

  messageCount: {
    type: Number,
    default: 0,
  },

  warns: {
    type: Number,
    default: 0,
  },

  language: {
    type: String,
    default: 'en',
  },

  joinedAt: {
    type: Date,
    default: Date.now,
  },

  inventory: [String],

  stats: {
    commandsUsed: {
      type: Number,
      default: 0,
    },

    gamesPlayed: {
      type: Number,
      default: 0,
    },

    gamesWon: {
      type: Number,
      default: 0,
    },
  },
});

/* ──────────────────────────────────────────────
   GROUP SCHEMA
────────────────────────────────────────────── */
const groupSchema = new mongoose.Schema({
  jid: {
    type: String,
    unique: true,
    required: true,
    index: true,
  },

  name: String,

  welcome: {
    type: Boolean,
    default: true,
  },

  welcomeMsg: String,

  goodbye: {
    type: Boolean,
    default: false,
  },

  antispam: {
    type: Boolean,
    default: false,
  },

  antilink: {
    type: Boolean,
    default: false,
  },

  mute: {
    type: Boolean,
    default: false,
  },

  nsfw: {
    type: Boolean,
    default: false,
  },

  language: {
    type: String,
    default: 'en',
  },

  warns: {
    type: Map,
    of: Number,
    default: {},
  },

  joinedAt: {
    type: Date,
    default: Date.now,
  },
});

/* ──────────────────────────────────────────────
   SESSION SCHEMA
────────────────────────────────────────────── */
const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    unique: true,
    required: true,
    index: true,
  },

  data: mongoose.Schema.Types.Mixed,

  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

/* ──────────────────────────────────────────────
   BOT STATS
────────────────────────────────────────────── */
const statsSchema = new mongoose.Schema({
  date: {
    type: String,
    unique: true,
  },

  commandsRun: {
    type: Number,
    default: 0,
  },

  messagesReceived: {
    type: Number,
    default: 0,
  },

  activeUsers: [String],

  errors: {
    type: Number,
    default: 0,
  },
});

/* ──────────────────────────────────────────────
   DELETED MESSAGES CACHE
────────────────────────────────────────────── */
const deletedMsgSchema = new mongoose.Schema({
  jid: String,
  sender: String,
  senderName: String,
  content: String,
  type: String,
  mediaUrl: String,

  timestamp: {
    type: Date,
    default: Date.now,
    expires: 86400, // 24 hours
  },
});

/* ──────────────────────────────────────────────
   SUBSCRIBERS
────────────────────────────────────────────── */
const subscriberSchema = new mongoose.Schema({
  jid: {
    type: String,
    unique: true,
    index: true,
  },

  name: String,

  addedAt: {
    type: Date,
    default: Date.now,
  },
});

/* ──────────────────────────────────────────────
   MODELS
────────────────────────────────────────────── */
export const User =
  mongoose.models.User ||
  mongoose.model('User', userSchema);

export const Group =
  mongoose.models.Group ||
  mongoose.model('Group', groupSchema);

export const Session =
  mongoose.models.Session ||
  mongoose.model('Session', sessionSchema);

export const BotStats =
  mongoose.models.BotStats ||
  mongoose.model('BotStats', statsSchema);

export const DeletedMsg =
  mongoose.models.DeletedMsg ||
  mongoose.model('DeletedMsg', deletedMsgSchema);

export const Subscriber =
  mongoose.models.Subscriber ||
  mongoose.model('Subscriber', subscriberSchema);

/* ──────────────────────────────────────────────
   HELPERS
────────────────────────────────────────────── */

export async function getUser(jid, name = '') {
  let user = await User.findOne({ jid });

  if (!user) {
    user = await User.create({
      jid,
      name,
    });
  }

  if (name && user.name !== name) {
    user.name = name;
    await user.save();
  }

  return user;
}

export async function getGroup(jid, name = '') {
  let group = await Group.findOne({ jid });

  if (!group) {
    group = await Group.create({
      jid,
      name,
    });
  }

  return group;
}

export async function getTodayStats() {
  const today = new Date().toISOString().split('T')[0];

  let stats = await BotStats.findOne({
    date: today,
  });

  if (!stats) {
    stats = await BotStats.create({
      date: today,
    });
  }

  return stats;
}
