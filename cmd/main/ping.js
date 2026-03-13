export default function (commander) {
  commander.on({
    cmd: ['ping', 'p'],
    desc: 'Test bot response latency',
    usage: '',
  }, async (m) => {
    const start = Date.now();

    // 1. Kirim pesan awalan (misal: "Pinging...")
    const sentMsg = await m.reply('Menghitung ping... 🏓');

    // 2. Kalkulasi waktu jeda
    const latency = Date.now() - start;

    // 3. Edit pesan pertama agar terlihat lebih bersih (Fitur Baileys)
    if (sentMsg && sentMsg.key) {
      await m.sock.sendMessage(m.from, {
        text: `*PONG!* 🏓\nLatensi: *${latency}ms*`,
        edit: sentMsg.key
      });
    } else {
      // Fallback jika karena alasan tertentu gagal mendapat context pesan sebelumnya
      await m.reply(`*PONG!* 🏓\nLatensi: *${latency}ms*`);
    }
  });
}