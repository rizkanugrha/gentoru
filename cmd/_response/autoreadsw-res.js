/**
 * 
 * Deskripsi: Otomatis read sw
 */

import config from "../../config.js";
import { sendTelegram } from "../../lib/utils/function.js";

export default function (response) {
    response.on({
        // Karena ini event otomatis, kita tidak butuh properti 'cmd' atau 'aliases'
        name: 'readsw',
        execute: async (m, client, ctx) => {
            try {
                // Auto Read Status
                if (m.key && !m.key.fromMe && m.key.remoteJid === 'status@broadcast') {
                    if (m.type === 'protocolMessage' && m.message.protocolMessage.type === 0) return;

                    client.readMessages([m.key]).catch(() => { });

                    if (config.tele.TELEGRAM_TOKEN && config.tele.ID_TELEGRAM) {
                        let id = m.key.participant || m.key.remoteJid;
                        let name = m.name;

                        let text = `Status dari ${name} (${id.split('@')[0]})\n${m.body || ''}`;

                        if (m.isMedia) {
                            let media = await client.downloadMediaMessage(m);
                            sendTelegram(config.tele.ID_TELEGRAM, media, { type: /audio/.test(m.msg.mimetype) ? 'document' : '', caption: text }).catch(() => { });
                        } else {
                            sendTelegram(config.tele.ID_TELEGRAM, text).catch(() => { });
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