import { exec } from 'child_process';
import util from 'util'

export default function (commander) {
    commander.on({
        cmd: ['ambil'],
        desc: 'Test bot response',
        usage: '',
    }, async (m) => {
        try {
            let msg = m.quoted ? m.quoted : m;
            const buffer = await sock.downloadMediaMessage(msg)
            if (msg.type === 'videoMessage') {
                await sock.sendMessage(m.from, { video: buffer, force: true }, { quoted: m })
            } else if (msg.type === 'imageMessage') {
                await sock.sendMessage(m.from, { image: buffer, force: true }, { quoted: m })
            } else if (msg.type === 'documentMessage') {
                await sock.sendMessage(m.from, { image: buffer, force: true }, { quoted: m })
            } else if (msg.type === 'audioMessage') {
                await sock.sendMessage(m.from, { audio: buffer, force: true }, { quoted: m })
            }
        } catch (error) {
            console.log(error)
            await m.reply(util.format(error))
        }
    });
}

