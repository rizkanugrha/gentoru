import { idulFitri1 } from '../../lib/scrape/canvas/idul-fitri.js'

export default function (cmd) {

    cmd.on({
        name: "ied",
        cmd: ['idulfitri', 'fitr', 'ucapanidulfitri', 'ied', 'iedfitr', 'cardfitri', 'fitri'],
        desc: "Membuat kartu ucapan Idul Fitri",
        category: 'Maker',
        noPrefix: true,
        async execute(client, m, ctx) {
            try {
                await m.react('🕒')

                // Gabungkan argumen dan pisahkan berdasarkan karakter '|'
                let text = ctx.args.join(' ');

                // Cek apakah ada pemisah '|'
                if (!text.includes('|')) {
                    await m.react('❌');
                    return m.reply(`Format salah!\nContoh penggunaan: ${ctx.prefix || ''}${ctx.cmds} Keluarga Besar | Ocha`);
                }

                let [untuk, dari] = text.split('|').map(v => v.trim());

                // Pastikan kedua sisi (sebelum dan sesudah |) tidak kosong
                if (!untuk || !dari) {
                    await m.react('❌');
                    return m.reply(`Format salah!\nContoh penggunaan: ${ctx.prefix || ''}${ctx.cmds} Keluarga Besar | Ocha`);
                }

                // ==========================================
                // VALIDASI MAKSIMAL 20 KARAKTER
                // ==========================================
                if (untuk.length > 20 || dari.length > 20) {
                    await m.react('❌');
                    return m.reply(`⚠️ Teks terlalu panjang!\n\nMaksimal 20 karakter untuk masing-masing bagian.\n\nInputmu:\n- Untuk: ${untuk.length} karakter\n- Dari: ${dari.length} karakter`);
                }

                // Jika lolos validasi, buat gambarnya
                const imageBuffer = await idulFitri1(untuk, dari);

                // Kirim hasil gambar ke user
                await client.sendMessage(m.from, { image: imageBuffer }, { quoted: m })
                await m.react('✅')

            } catch (e) {
                console.error(e);
                await m.react('🍉') // Error fallback
            }
        }
    })

}