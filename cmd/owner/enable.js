export default function(techwiz) {
  techwiz.on({
    cmd: ['on', 'enable'],
    desc: 'Enable features',
    isOwner: true
  }, async (tch) => {
    const setting = tch.db.get('setting', 'setting', {});

    const text = tch.text.trim().toLowerCase();
    switch (text) {
      case '1':
        setting.firstchat = true;
        tch.db.set('setting', 'setting', setting);
        await tch.reply('_First chat berhasil diaktifkan!!_');
        break;
      case '2':
        setting.readstory = true;
        tch.db.set('setting', 'setting', setting);
        await tch.reply('_Read story berhasil diaktifkan!!_');
        break;
      case '3':
        setting.reactstory = true;
        tch.db.set('setting', 'setting', setting);
        await tch.reply('_Reaction story berhasil diaktifkan!!_');
        break;
      case '4':
        setting.autoread = true;
        tch.db.set('setting', 'setting', setting);
        await tch.reply('_Auto read chat berhasil diaktifkan!!_');
        break;
      case '5':
        setting.self = true;
        tch.db.set('setting', 'setting', setting);
        await tch.reply('_Self mode berhasil diaktifkan!!_');
        break;
      default:
        await tch.reply(`_Tidak ada fitur yang ditemukan_

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
