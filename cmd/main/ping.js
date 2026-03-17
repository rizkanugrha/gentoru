
export default function (cmd) {

  cmd.on({
    name: "tes",
    cmd: ["tes", "bot"],
    desc: "test bot latency",
    noPrefix: true,
    async execute(client, m, ctx) {
      //  console.log(ctx.isOwner);

      // const nim = ctx.args[0];
      const start = Date.now();

      const sentMsg = await m.reply('Menghitung ping... 🏓');

      const latency = Date.now() - start;

      if (sentMsg && sentMsg.key) {
        await client.sendMessage(m.from, {
          text: `*PONG!* 🏓\nLatensi: *${latency}ms*`,
          edit: sentMsg.key
        });
      } else {
        // Fallback jika karena alasan tertentu gagal mendapat context pesan sebelumnya
        await m.reply(`*PONG!* 🏓\nLatensi: *${latency}ms*`);
      }
    }
  })

  cmd.on({
    name: "pong",
    cmd: ["pong"],
    async execute(m) {
      await m.reply("Ping dong!")
    }
  })

}

/**
 * export default {
  name: "ping",
  cmd: ["ping"],

  async execute(m, ctx) {
    const nim = ctx.args[0];
    const start = Date.now();

    const sentMsg = await m.reply('Menghitung ping... 🏓');

    const latency = Date.now() - start;

    if (sentMsg && sentMsg.key) {
      await client.sendMessage(m.from, {
        text: `*PONG!* 🏓\nLatensi: *${latency}ms*`,
        edit: sentMsg.key
      });
    } else {
      // Fallback jika karena alasan tertentu gagal mendapat context pesan sebelumnya
      await m.reply(`*PONG!* 🏓\nLatensi: *${latency}ms*`);
    }
  }
}
 */