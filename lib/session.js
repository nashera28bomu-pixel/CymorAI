import { Session } from '../database/db.js';

/**
 * MongoDB-backed auth state for Baileys
 * Persists session across Render/Koyeb restarts
 */
export async function useMongoAuthState(sessionId) {
  const KEY_MAP = {
    'pre-key': 'preKeys',
    'session': 'sessions',
    'sender-key': 'senderKeys',
    'app-state-sync-key': 'appStateSyncKeys',
    'app-state-sync-version': 'appStateSyncVersion',
    'sender-key-memory': 'senderKeyMemory',
  };

  const getDoc = async (id) => {
    const doc = await Session.findOne({ sessionId: `${sessionId}:${id}` });
    return doc ? doc.data : null;
  };

  const setDoc = async (id, data) => {
    await Session.findOneAndUpdate(
      { sessionId: `${sessionId}:${id}` },
      { data, updatedAt: new Date() },
      { upsert: true, new: true }
    );
  };

  const deleteDoc = async (id) => {
    await Session.deleteOne({ sessionId: `${sessionId}:${id}` });
  };

  const credsDoc = await getDoc('creds');
  const { initAuthCreds } = await import('@whiskeysockets/baileys');
  const creds = credsDoc || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              const key = `${KEY_MAP[type] || type}:${id}`;
              const val = await getDoc(key);
              if (val) data[id] = val;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const key = `${KEY_MAP[category] || category}:${id}`;
              const val = data[category][id];
              if (val) tasks.push(setDoc(key, val));
              else tasks.push(deleteDoc(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await setDoc('creds', creds);
    },
  };
}
