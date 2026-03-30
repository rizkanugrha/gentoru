
import { exec } from 'child_process';
import util from 'util'
import { jidNormalizedUser } from 'baileys'
export default function (cmd) {

    cmd.on({
        name: "view",
        cmd: ["xixi", "ehe", "wah", "view", "rvo", "xiexie", "viewonce"],
        category: 'Owner',
        pconly: false,
        group: false,
        admin: false,
        botAdmin: false,
        owner: true,
        noPrefix: true,
        async execute(client, m, ctx) {
            try {
            let quoted = m.isQuoted ? m.quoted : m;

            if (!quoted.msg.viewOnce) return;
            quoted.msg.viewOnce = false;
            // await m.reply({ forward: quoted, force: true });
            client.sendMessage(jidNormalizedUser(client.user.id), { forward: quoted, force: true })
        } catch (e) {
            console.log(e);
        }
        }
    })


}

