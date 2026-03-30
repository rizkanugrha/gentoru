/**
 * Deskripsi: Otomatis membalas pesan pertama dari user di Private Chat
 */
import db from '../../lib/database.js'
export default function (response) {
    response.on({
        name: 'firstchat-res',
        execute: async (m, client, ctx) => {

            if (m.isBot || ctx.isGroupMsg || ctx.isOwner) return;

            try {
                // Ambil data dari database
                const setting = db.get('setting', 'setting', {});
                const user = db.get('users', m.sender, {});

                // Mengecek apakah fitur firstchat menyala (true)
                if (setting?.firstchat) {
                    const now = Date.now();
                    const lastChat = user.lastChat || -1;

                    // Jeda waktu untuk first chat (misal: 24 jam = 86400000 ms)
                    // Jika lastChat masih -1 (user baru) atau sudah lewat 24 jam sejak chat terakhir
                    if (lastChat === -1 || (now - lastChat) > 86400000) {

                        const pushname = m.name || "Kak";
                        const firstChatMessage = `Halo ${pushname}! 👋\n\nSelamat datang di BOT automate create kartu ucapan Hari Raya Idul Fitri\n\nsilakan command !menu untuk memulai`;

                        if (typeof m.reply === 'function') {
                            await m.reply(firstChatMessage);
                        }

                        user.lastChat = now;
                        db.set('users', m.sender, user);
                    }
                }
            } catch (error) {
                console.error("❌ Error di event firstchat:", error.message);
            }
        }
    });
}