import { exec } from 'child_process';
import util from 'util';

export default function(techwiz) {
  techwiz.on({
    cmd: ['>'],
    desc: 'Eval JavaScript code (Owner only)',
    isOwner: true,
    noPrefix: true
  }, async (tch) => {
    let text = '';
    if (tch.args && tch.args.length > 0) {
      text = tch.args.join(' ');
    } else {
      text = tch.body.trim();
      if (text.startsWith('>')) {
        text = text.substring(1).trim();
      }
    }
    if (!text) {
      return await tch.reply('Please provide code to evaluate\nExample: > console.log("Hello")');
    }

    text = text.replace(/×/g, '.toString()');

    function usr(sender) {
      return tch.db.get('users', sender, {});
    }

    function gc(sender) {
      return tch.db.get('groups', sender, {});
    }

    function add(module) {
      return import(module);
    }

    let evalCmd;
    try {
      evalCmd = /await/i.test(text)
        ? eval('(async () => { ' + text + ' })()')
        : eval(text);
    } catch (e) {
      return await tch.reply(util.format(e));
    }

    try {
      const result = await evalCmd;
      await tch.reply(util.format(result));
    } catch (err) {
      await tch.reply(util.format(err));
    }
  });

  techwiz.on({
    cmd: ['$'],
    desc: 'Shell exec command (Owner only)',
    isOwner: true,
    noPrefix: true
  }, async (tch) => {
    let command = '';
    if (tch.args && tch.args.length > 0) {
      command = tch.args.join(' ');
    } else {
      command = tch.body.trim();
      if (command.startsWith('$')) {
        command = command.substring(1).trim();
      }
    }
    if (!command) {
      return await tch.reply('Please provide command to execute\nExample: $ ls');
    }

    try {
      await tch.reply('Processing...');
      
      exec(command, (err, stdout, stderr) => {
        if (err) {
          return tch.reply(
            `Error: ${err.message}\nExit Code: ${err.code}\nSignal: ${err.signal}\n${stderr || ''}`
          );
        }
        if (stdout) {
          return tch.reply(util.format(stdout));
        }
        if (stderr) {
          return tch.reply(util.format(stderr));
        }
        return tch.reply('Command executed successfully (no output)');
      });
    } catch (e) {
      await tch.reply(util.format(e));
    }
  });
}
