export default function (commander) {
    commander.on({
        cmd: ['help', 'menu'],
        desc: 'Show help menu',
        usage: '',
        noPrefix: false
    }, async (m) => {
        const commands = commander.getCommands();
        const prefix = m.sock.config?.prefix || '.';

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
                helpText += `• *${prefix}${cmdName}* ${cmd.usage}\n`;
            });
        }

        await m.reply(helpText);
    });
}
