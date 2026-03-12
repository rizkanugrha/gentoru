export default function (commander) {
  commander.on({
    cmd: ['on', 'enable'],
    desc: 'Enable features',
    usage: '',
    isOwner: true
  }, async (m) => {
    const setting = m.db.get('setting', 'setting', {});

    const text = m.text.trim().toLowerCase();
    switch (text) {
      case '1':
        setting.firstchat = true;
        m.db.set('setting', 'setting', setting);
        await m.reply('_First chat berhasil diaktifkan!!_');
        break;
      case '2':
        setting.readstory = true;
        m.db.set('setting', 'setting', setting);
        await m.reply('_Read story berhasil diaktifkan!!_');
        break;
      case '3':
        setting.reactstory = true;
        m.db.set('setting', 'setting', setting);
        await m.reply('_Reaction story berhasil diaktifkan!!_');
        break;
      case '4':
        setting.autoread = true;
        m.db.set('setting', 'setting', setting);
        await m.reply('_Auto read chat berhasil diaktifkan!!_');
        break;
      case '5':
        setting.self = true;
        m.db.set('setting', 'setting', setting);
        await m.reply('_Self mode berhasil diaktifkan!!_');
        break;
      default:
        await m.reply(`_Tidak ada fitur yang ditemukan_

*List fitur:*
1. First chat
2. Read story
3. Reaction story
4. Auto read chat
5. Self mode

example: .on 1`);
    }
  });
}
