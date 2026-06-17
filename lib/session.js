import {
  BufferJSON,
  initAuthCreds,
  proto,
} from '@whiskeysockets/baileys';

import { Session } from '../database/db.js';

export async function useMongoAuthState(sessionId) {
  const writeData = async (id, data) => {
    const value = JSON.parse(
      JSON.stringify(data, BufferJSON.replacer)
    );

    await Session.findOneAndUpdate(
      { sessionId: `${sessionId}:${id}` },
      {
        sessionId: `${sessionId}:${id}`,
        data: value,
        updatedAt: new Date(),
      },
      {
        upsert: true,
      }
    );
  };

  const readData = async (id) => {
    const doc = await Session.findOne({
      sessionId: `${sessionId}:${id}`,
    }).lean();

    if (!doc?.data) return null;

    return JSON.parse(
      JSON.stringify(doc.data),
      BufferJSON.reviver
    );
  };

  const removeData = async (id) => {
    await Session.deleteOne({
      sessionId: `${sessionId}:${id}`,
    });
  };

  const creds =
    (await readData('creds')) ||
    initAuthCreds();

  return {
    state: {
      creds,

      keys: {
        get: async (type, ids) => {
          const data = {};

          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(
                `${type}-${id}`
              );

              if (
                type ===
                  'app-state-sync-key' &&
                value
              ) {
                value =
                  proto.Message.AppStateSyncKeyData.fromObject(
                    value
                  );
              }

              data[id] = value;
            })
          );

          return data;
        },

        set: async (data) => {
          const tasks = [];

          for (const category in data) {
            for (const id in data[category]) {
              const value =
                data[category][id];

              const key =
                `${category}-${id}`;

              if (value) {
                tasks.push(
                  writeData(key, value)
                );
              } else {
                tasks.push(
                  removeData(key)
                );
              }
            }
          }

          await Promise.all(tasks);
        },
      },
    },

    saveCreds: async () => {
      await writeData(
        'creds',
        creds
      );
    },
  };
}
