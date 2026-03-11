export default function (techwiz) {
    techwiz.on({
        cmd: ['help', 'menu'],
        desc: 'Show help menu',
        noPrefix: false
    }, async (tch) => {
        const commands = techwiz.getCommands();
        const prefix = tch.sock.config?.prefix || '.';

        let helpText = `*BotWA Help Menu*\n\n`;
        helpText += `Prefix: *${prefix}*\n\n`;
        helpText += `*Commands:*\n`;

        const categories = {};
        commands.forEach(cmd => {
            const category = 'General';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(cmd);
        });

        for (const [category, cmds] of Object.entries(categories)) {
            helpText += `\n*${category}:*\n`;
            cmds.forEach(cmd => {
                const cmdName = cmd.cmd[0];
                helpText += `• ${prefix}${cmdName} - ${cmd.desc}\n`;
            });
        }

        await tch.reply(helpText);
    });
}
