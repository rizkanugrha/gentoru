export default function (cmd) {

    cmd.on({
        name: "menu",
        cmd: ["menu", "help"],
        desc: "Menampilkan daftar command",
        noPrefix: true,
        async execute(client, m, ctx) {

            const commands = [...cmd.commands.values()]

            const grouped = {}

            for (const c of commands) {

                const cat = c.category || "General"

                if (!grouped[cat]) grouped[cat] = []

                grouped[cat].push(c)

            }

            let text = "📜 *BOT COMMAND MENU*\n\n"

            for (const category in grouped) {

                text += `*${category}*\n`

                for (const c of grouped[category]) {

                    text += `• ${ctx.prefix}${c.cmd[0]} - ${c.desc}\n`

                }

                text += "\n"
            }

            m.reply(text)

        }
    })

}