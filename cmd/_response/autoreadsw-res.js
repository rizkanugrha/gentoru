/**
 * Deskripsi: Otomatis read sw 
 */

import config from "../../config.js";
import { jidNormalizedUser } from 'baileys'

export default function (response) {
    response.on({
        name: 'readsw',
        execute: async (m, client, ctx) => {
            try {
                if (m.key && !m.key.fromMe && m.key.remoteJid === 'status@broadcast') {

                    if (m.type === 'protocolMessage' && m.message.protocolMessage.type === 0) return;

                    await new Promise(resolve => setTimeout(resolve, 2500));

                    const statusKey = {
                        remoteJid: 'status@broadcast',
                        id: m.key.id,
                        participant: jidNormalizedUser(m.participant || m.sender)
                    };

                    await client.sendPresenceUpdate('available').catch(() => { });


                    /**  await client.readMessages([m.key]).catch((err) => {
                          console.error("❌ Gagal read status (Baileys Error):", err.message);
                      });*/

                    await client.sendReceipts([statusKey], 'read').catch((err) => {
                        console.error("❌ Gagal read status (Baileys Error): ", err.message);
                    });


                    return;
                }
            } catch (error) {
                console.error("❌ Error di event autoread:", error.message);
            }
        }
    });
}