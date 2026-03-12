import config from '../../config.js';

const schema = async (m, sock, db) => {
  const isNumber = x => typeof x === 'number' && !isNaN(x);
  const isBoolean = x => typeof x === 'boolean' && Boolean(x);

  db.users = db.users || {};
  db.groups = db.groups || {};
  db.contacts = db.contacts || {};
  db.groupMetadata = db.groupMetadata || {};
  db.setting = db.setting || {};
  db.stats = db.stats || {};

  if (m.sender && m.sender.endsWith('newsletter')) return;

  const send = m.sender && m.sender.endsWith("lid") ? m.key.participant : m.sender;
  if (send === 'null' || !send) return;

  let user = db.users[send];
  if (typeof user !== 'object') db.users[send] = {};

  if (user) {
    if (!send.endsWith('@s.whatsapp.net')) return;
    if (!('name' in user)) user.name = m.pushName || (sock && sock.getName ? sock.getName(send) : send.split('@')[0]);
    if (!('lastChat' in user)) user.lastChat = -1;
    if (!isNumber(user.afk)) user.afk = -1;
    if (!('afk_reason' in user)) user.afk_reason = '';
    if (!isNumber(user.warn)) user.warn = 0;
    if (!isBoolean(user.autoDownload)) user.autoDownload = false;
    if (!isBoolean(user.autoSticker)) user.autoSticker = false;
  } else {
    db.users[send] = {
      name: m.pushName || (sock && sock.getName ? sock.getName(send) : send.split('@')[0]),
      lastChat: -1,
      afk: -1,
      afk_reason: '',
      warn: 0,
      autoDownload: false,
      autoSticker: false,
    };
  }

  if (m.isGroup) {
    let group = db.groups[m.from];
    if (typeof group !== 'object') db.groups[m.from] = {};

    if (group) {
      if (!m.from.endsWith('@g.us')) return;
      if (!('name' in group)) group.name = db.groupMetadata[m.from]?.subject || 'Unknown Group';
      if (!isNumber(group.lastChat)) group.lastChat = Date.now();
      if (!isBoolean(group.mute)) group.mute = false;
      if (!isBoolean(group.antiLink)) group.antiLink = false;
      if (!('link' in group)) group.link = [];
      if (!isBoolean(group.autoDownload)) group.autoDownload = false;
      if (!isBoolean(group.autoSticker)) group.autoSticker = false;
      if (!('blacklist' in group)) group.blacklist = [];
      if (!isBoolean(group.welcome)) group.welcome = false;
      if (!isBoolean(group.left)) group.left = false;
      if (!('msg' in group)) group.msg = {
        welcome: 'selamat datang -user di -subject.\nsilahkan baca desc grup dibawah ini & taati rules grup!!\n\n-desc',
        left: 'sampai jumpa lagi -user'
      };
      if (!('note' in group)) group.note = {};
    } else {
      db.groups[m.from] = {
        name: db.groupMetadata[m.from]?.subject || 'Unknown Group',
        lastChat: Date.now(),
        mute: false,
        antiLink: false,
        link: [],
        autoDownload: false,
        autoSticker: false,
        blacklist: [],
        welcome: false,
        left: false,
        msg: {
          welcome: 'selamat datang -user di -subject.\nsilahkan baca desc grup dibawah ini & taati rules grup!!\n> added by: -author\n\n-desc',
          left: 'sampai jumpa lagi -user\n> removed by: -author'
        },
        note: {}
      };
    }
  }

  let setting = db.setting;
  if (setting) {
    if (!('firstchat' in setting)) setting.firstchat = false;
    if (!('readstory' in setting)) setting.readstory = true;
    if (!('autoread' in setting)) setting.autoread = false;
    if (!('self' in setting)) setting.self = true;
    if (!('number' in setting)) setting.number = '';
    if (!('owner' in setting)) {
      setting.owner = Array.isArray(config.bot.owner) ? config.bot.owner : [config.bot.owner];
    } else if (!Array.isArray(setting.owner)) {
      setting.owner = [setting.owner];
    }
    if (!('logo' in setting)) setting.logo = '';
    if (!('author' in setting)) setting.author = config.bot.author;
    if (!('packname' in setting)) setting.packname = config.bot.packname;
  } else {
    db.setting = {
      firstchat: true,
      readstory: true,
      autoread: false,
      self: true,
      number: '',
      owner: Array.isArray(config.bot.owner) ? config.bot.owner : [config.bot.owner],
      logo: '',
      author: config.bot.author,
      packname: config.bot.packname,
    };
  }
};

export default {
  schema
};
