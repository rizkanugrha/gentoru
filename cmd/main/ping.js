export default function(techwiz) {
    techwiz.on({
      cmd: ['ping', 'p'],
      desc: 'Test bot response',
    }, async (tch) => {
      const start = Date.now();
      await tch.reply('Pong!');
      const latency = Date.now() - start;
      await tch.reply(`Latency: ${latency}ms`);
    });
  }
  