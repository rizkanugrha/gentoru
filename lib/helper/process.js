import config from '../../config.js';

export class MessageProcessor {
    constructor(commandHandler) {
        this.cmd = commandHandler;
    }

    async process(sock, m, db) {
        if (!m || !m.msg || !m.key) return;

        let command = null;

        // 1. Cek command tanpa prefix (noPrefix)
        for (const [cmdName, cmdData] of this.cmd.commands.entries()) {
            if (cmdData.noPrefix) {
                const cmdIsAlphaNum = /^[a-z0-9]+$/i.test(cmdName);
                if (m.body === cmdName || m.body.startsWith(cmdName + ' ') || (!cmdIsAlphaNum && m.body.startsWith(cmdName))) {
                    command = cmdData;
                    const remainingText = m.body.substring(cmdName.length).trim();
                    m.args = remainingText ? remainingText.split(' ') : [];
                    break;
                }
            }
        }

        // 2. Cek command dengan prefix (m.isCmd sudah dideteksi di serialize)
        if (!command && m.isCmd) {
            const cmdName = m.command?.toLowerCase();
            if (this.cmd.commands.has(cmdName)) {
                command = this.cmd.commands.get(cmdName);
            }
        }

        // Tambahkan referensi instan agar bisa diakses jika module command butuh
        m.sock = sock;
        m.db = db;
        m.jid = m.from;

        // Eksekusi trigger global (seperti auto-response/catch-all dengan '*')
        for (const [cmdName, cmdData] of this.cmd.commands.entries()) {
            if (cmdData.noPrefix && cmdName === '*' && !m.key.fromMe) {
                try { await cmdData.handler(m); }
                catch (error) { console.error('Response handler error:', error); }
            }
        }

        // Validasi Eksekusi Command Utama
        if (command) {
            // Cek Owner
            if (command.isOwner && !m.key.fromMe && !m.isOwner) {
                await m.reply(config.cmdMsg.owner);
                return;
            }

            // Cek Only Group
            if (command.isGc && !m.isGroup) {
                await m.reply(config.cmdMsg.groupMsg);
                return;
            }

            // Cek Only Private Chat
            if (command.isPc && m.isGroup) {
                await m.reply(config.cmdMsg.pconly);
                return;
            }

            // Cek Admin Grup
            if (command.isAdmin && m.isGroup && !m.isAdmin) {
                await m.reply(config.cmdMsg.notGroupAdmin);
                return;
            }

            // Cek Bot Admin Grup
            if (command.isBotAdmin && m.isGroup && !m.isBotAdmin) {
                await m.reply(config.cmdMsg.botNotAdmin);
                return;
            }

            // Lakukan eksekusi command dengan meneruskan m
            try {
                await command.handler(m, sock);
            } catch (error) {
                console.error(`[ERROR] Command ${m.command || 'handler'}:`, error.message);
                sock.sendMessage(m.from, { text: `Error: ${error.message || 'Unknown error'}` }).catch(() => { });
            }
        }
    }
}