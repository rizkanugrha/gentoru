import db from '../../lib/database.js';
export default function (cmd) {

    cmd.on({
        name: "firstchat",
        cmd: ["fc"],
        owner: true,
        category: 'Owner',
        noPrefix: true,
        async execute(client, m, ctx) {

            const setting = db.get('setting', 'setting', {});

            // Jika owner tidak memberikan argumen 'on' atau 'off'
            if (!ctx.args[0]) {
                return m.reply(`*Format salah!*\n\nContoh penggunaan:\n» ${(ctx.prefix || '') + ctx.cmds} on\n» ${(ctx.prefix || '') + ctx.cmds}  off\n\n_Status saat ini: ${setting?.firstchat ? 'Aktif ✅' : 'Mati ❌'}_`);
            }

            const option = ctx.args[0].toLowerCase();

            if (option === 'on') {
                if (setting.firstchat) return m.reply('Fitur First Chat sudah dalam keadaan aktif sebelumnya.');

                // Ubah menjadi true (nyala)
                setting.firstchat = true;
                db.set('setting', 'setting', setting);
                m.reply('✅ Berhasil *mengaktifkan* fitur First Chat.');

            } else if (option === 'off') {
                if (!setting.firstchat) return m.reply('Fitur First Chat sudah dalam keadaan mati sebelumnya.');

                setting.firstchat = false;
                db.set('setting', 'setting', setting);
                m.reply('✅ Berhasil *mematikan* fitur First Chat.');

            } else {
                m.reply(`*Opsi tidak valid!*\n\nPilih *on* untuk menghidupkan, atau *off* untuk mematikan.`);
            }
        }
    })

}
