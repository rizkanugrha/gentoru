export default function(techwiz) {
  techwiz.on({
    cmd: ['eval', 'e'],
    desc: 'Evaluate JavaScript code (Owner only)',
    isOwner: true
  }, async (tch) => {
    const code = tch.args.join(' ');
    if (!code) {
      return await tch.reply('Please provide code to evaluate');
    }
    
    try {
      const result = eval(code);
      await tch.reply(`Result:\n\`\`\`${JSON.stringify(result, null, 2)}\`\`\``);
    } catch (error) {
      await tch.reply(`Error:\n\`\`\`${error.message}\`\`\``);
    }
  });
}
