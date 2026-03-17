import util from 'util'
export default function (cmd) {

    cmd.on({
        name: "eval",
        cmd: ["eval", ">", "ev"],
        desc: "test bot latency",
        category: 'Owner',
        pconly: false,
        group: false,
        admin: false,
        botAdmin: false,
        owner: true,
        noPrefix: true,
        async execute(client, m, ctx) {
            let text = ctx.args.join(' ')
            if (!text) {
                return await m.reply('Please provide code to evaluate\nExample: > console.log("Hello")');
            }

            let evalCmd;
            try {
                evalCmd = /await/i.test(text)
                    ? eval('(async () => { ' + text + ' })()')
                    : eval(text);
            } catch (e) {
                return await m.reply(util.format(e));
            }

            try {
                const result = await evalCmd;
                await m.reply(util.format(result));
            } catch (err) {
                await m.reply(util.format(err));
            }
        }
    })


}
