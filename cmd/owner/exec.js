
import { exec } from 'child_process';
import util from 'util'
export default function (cmd) {

    cmd.on({
        name: "exec",
        cmd: ["$", "exec", "kode"],
        category: 'Owner',
        pconly: false,
        group: false,
        admin: false,
        botAdmin: false,
        owner: true,
        noPrefix: true,
        async execute(client, m, ctx) {
            try {
                let text = ctx.args.join(" ")
                exec(text, async (err, stdout) => {
                    if (err) return m.reply(util.format(err));
                    if (stdout) return m.reply(util.format(stdout));
                });
            } catch (e) {
                await m.reply(util.format(e));
            }
        }
    })


}

