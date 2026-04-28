export default function (cmd) {

    cmd.on({
        name: "menu",
        cmd: ["menu", "help"],
        category: "Main",
        desc: "Menampilkan daftar command",
        noPrefix: true,
        async execute(client, m, ctx) {

            // Ambil semua command unik
            const commands = [...new Set(cmd.commands.values())]

            // FITUR FILTERING: Sembunyikan command owner dari user biasa
            const visibleCommands = commands.filter(c => {
                // Jika command ini butuh akses owner, DAN yang nge-chat BUKAN owner
                // maka jangan tampilkan di menu (return false)
                if (c.owner && !ctx.isOwner) {
                    return false;
                }
                return true;
            });

            const grouped = {}

            // Looping dari command yang sudah di-filter saja
            for (const c of visibleCommands) {

                const cat = c.category

                if (!grouped[cat]) grouped[cat] = []

                grouped[cat].push(c)

            }

            let text = "📜 *BOT COMMAND MENU*\n\n"

            if (Object.keys(grouped).length === 0) {
                return m.reply("Belum ada command yang tersedia untukmu.");
            }

            for (const category in grouped) {

                text += `*${category}*\n`

                for (const c of grouped[category]) {

                    text += `• ${ctx.prefix || ""}${c.name} \n`

                }

                text += "\n"
            }

            m.reply(text)

        }
    })

}