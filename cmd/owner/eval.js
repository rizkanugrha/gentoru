import util from 'util'
export default function (commander) {
  commander.on({
    cmd: ['eval', 'e', '>'],
    desc: 'Evaluate JavaScript code (Owner only)',
    usage: '',
    noPrefix: true,
    isOwner: true
  }, async (m) => {
    const text = m.args.join(' ');
    if (!text) {
      return await m.reply('Please provide code to evaluate');
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
  });
}
