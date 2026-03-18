/**
 * Deskripsi: Otomatis read sw dan forward ke Telegram
 */

import config from "../../config.js";
import { sendTelegram } from "../../lib/utils/function.js";
import { jidNormalizedUser } from 'baileys'

export default function (response) {
    response.on({
        name: 'readsw',
        execute: async (m, client, ctx) => {
            try {
                if (m.key && !m.key.fromMe && m.key.remoteJid === 'status@broadcast') {
                    // Abaikan pesan tipe revoke (tarik pesan)
                    if (m.type === 'protocolMessage' && m.message.protocolMessage.type === 0) return;

                    // Jeda agar tidak terdeteksi spam bot
                    await new Promise(resolve => setTimeout(resolve, 2500));

                    // Gunakan m.sender karena sudah dinormalisasi dari serialize.js yang baru
                    
                    
                    const statusKey = {
                        remoteJid: 'status@broadcast',
                        id: m.key.id,
                        participant: jidNormalizedUser(m.participant || m.sender) 
                    };

                    // 1. Trik agar server WA memprioritaskan read receipt kita
                    await client.sendPresenceUpdate('available').catch(() => {});

                    // 2. Eksekusi Read (Gunakan readMessages standar)
                  /**  await client.readMessages([m.key]).catch((err) => {
                        console.error("❌ Gagal read status (Baileys Error):", err.message);
                    });*/
                    
                    await client.sendReceipts([statusKey], 'read').catch((err) => {
                        console.error("❌ Gagal read status (Baileys Error):", err.message);
                    });

                    // 3. Forward ke Telegram (Aman dari config kosong)
                    if (config?.tele?.TELEGRAM_TOKEN && config?.tele?.ID_TELEGRAM) {
                        let name = m.name;
                        let text = `Status dari ${name} (${m.sender.split('@')[0]})\n${ m.body || '' }`;

                        if (m.isMedia) {
                            // WAJIB pakai m.download() bawaan serialize.js kita
                            let media = await m.download();
                            
                            // Aman dari mimetype yang undefined
                            let isAudio = m.msg?.mimetype ? /audio/.test(m.msg.mimetype) : false;
                            
                            sendTelegram(config.tele.ID_TELEGRAM, media, { 
                                type: isAudio ? 'document' : '', 
                                caption: text 
                            }).catch((err) => {
                                console.error("❌ Gagal kirim media ke Tele:", err.message);
                            });
                        } else {
                            sendTelegram(config.tele.ID_TELEGRAM, text).catch((err) => {
                                console.error("❌ Gagal kirim teks ke Tele:", err.message);
                            });
                        }
                    }
                    return;
                }
            } catch (error) {
                console.error("❌ Error di event autoread:", error.message);
            }
        }
    });
}