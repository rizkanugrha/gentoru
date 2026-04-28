
import util from 'util'
export default function (cmd) {

    cmd.on({
        name: "delete",
        cmd: ["del", "delete"],
        category: 'Owner',
        pconly: false,
        group: false,
        admin: false,
        botAdmin: false,
        owner: true,
        noPrefix: true,
        async execute(client, m, ctx) {
            if (!m.quoted) return m.reply('Reply to the message you want to delete')
            try {
                await m.react('🕒')

                let bilek = m.message.extendedTextMessage.contextInfo.participant;
                let banh = m.message.extendedTextMessage.contextInfo.stanzaId;
                await client.sendMessage(m.from, { delete: { remoteJid: m.from, fromMe: false, id: banh, participant: bilek } });
                await m.react('✅')

            } catch {
                await client.sendMessage(m.from, { delete: m.quoted.vM.key });
                await m.react('🍉')

            }
        }
    })


}

