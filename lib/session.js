import { BufferJSON, initAuthCreds } from '@whiskeysockets/baileys';
import { Session } from '../database/db.js';

/**
 * MongoDB Auth State
 * Stores Baileys credentials and keys in MongoDB
 * Works across Render restarts and deployments
 */
export async function useMongoAuthState(sessionId) {
  const KEY_MAP = {
    'pre-key': 'preKeys',
    session: 'sessions',
    'sender-key': 'senderKeys',
    'app-state-sync-key': 'appStateSyncKeys',
    'app-state-sync-version': 'appStateSyncVersion',
    'sender-key-memory': 'senderKeyMemory',
  };

  /**
   * Get document from MongoDB
   */
  const getDoc = async (id) => {
    try {
      const doc = await Session.findOne({
        sessionId: `${sessionId}:${id}`,
      }).lean();

      if (!doc?.data) return null;

      return JSON.parse(
        JSON.stringify(doc.data),
        BufferJSON.reviver
      );
    } catch (err) {
      console.error(`❌ Failed to load ${id}:`, err.message);
      return null;
    }
  };

  /**
   * Save document to MongoDB
   */
  const setDoc = async (id, value) => {
    try {
      const data = JSON.parse(
        JSON.stringify(value, BufferJSON.replacer)
      );

      await Session.findOneAndUpdate(
        {
          sessionId: `${sessionId}:${id}`,
        },
        {
          sessionId: `${sessionId}:${id}`,
          data,
          updatedAt: new Date(),
        },
        {
          upsert: true,
          new: true,
        }
      );
    } catch (err) {
      console.error(`❌ Failed to save ${id}:`, err.message);
    }
  };

  /**
   * Delete document
   */
  const deleteDoc = async (id) => {
    try {
      await Session.deleteOne({
        sessionId: `${sessionId}:${id}`,
      });
    } catch (err) {
      console.error(`❌ Failed to delete ${id}:`, err.message);
    }
  };

  // Load creds or initialize new ones
  const creds = (await getDoc('creds')) || initAuthCreds();

  const state = {
    creds,

    keys: {
      get: async (type, ids) => {
        const data = {};

        await Promise.all(
          ids.map(async (id) => {
            const key =
              `${KEY_MAP[type] || type}:${id}`;

            const value = await getDoc(key);

            if (value) {
              data[id] = value;
            }
          })
        );

        return data;
      },

      set: async (data) => {
        const tasks = [];

        for (const category in data) {
          for (const id in data[category]) {
            const value = data[category][id];

            const key =
              `${KEY_MAP[category] || category}:${id}`;

            if (value) {
              tasks.push(setDoc(key, value));
            } else {
              tasks.push(deleteDoc(key));
            }
          }
        }

        await Promise.all(tasks);
      },
    },
  };

  /**
   * Save credentials
   */
  const saveCreds = async () => {
    try {
      await setDoc('creds', state.creds);

      if (state.creds.registered) {
        console.log('✅ Session saved and registered');
      } else {
        console.log('💾 Credentials updated');
      }
    } catch (err) {
      console.error('❌ saveCreds failed:', err.message);
    }
  };

  return {
    state,
    saveCreds,
  };
          }
