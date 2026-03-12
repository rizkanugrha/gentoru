import { exec } from 'child_process';
import util from 'util';

export default function (commander) {
  commander.on({
    cmd: ['$'],
    desc: 'Shell exec command (Owner only)',
    isOwner: true,
    noPrefix: true
  }, async (m) => {
    let command = '';
    if (m.args && m.args.length > 0) {
      command = m.args.join(' ');
    } else {
      command = m.body.trim();
      if (command.startsWith('$')) {
        command = command.substring(1).trim();
      }
    }
    if (!command) {
      return await m.reply('Please provide command to execute\nExample: $ ls');
    }

    try {
      await m.reply('Processing...');

      exec(command, (err, stdout, stderr) => {
        if (err) {
          return m.reply(
            `Error: ${err.message}\nExit Code: ${err.code}\nSignal: ${err.signal}\n${stderr || ''}`
          );
        }
        if (stdout) {
          return m.reply(util.format(stdout));
        }
        if (stderr) {
          return m.reply(util.format(stderr));
        }
        return m.reply('Command executed successfully (no output)');
      });
    } catch (e) {
      await m.reply(util.format(e));
    }
  });
}
