export default function (commander) {
  commander.on({
    cmd: ['ping', 'p'],
    desc: 'Test bot response',
    usage: '',
  }, async (m) => {
    const start = Date.now();
    await m.reply('Pong!');
    const latency = Date.now() - start;
    await m.reply(`Latency: ${latency}ms`);
  });
}
