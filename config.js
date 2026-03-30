export default {
  database: {
    type: 'json',
    mongodb: {
      uri: '#',
      dbName: 'wa2'
    },
    json: {
      path: './database/db.json'
    }
  },
  bot: {
    name: 'self-rzk',
    prefix: '!',
    owner: [
      "6285314240519"
    ],
    no_bot: "6287868261186",
    packname: 'self-rzk',
    author: '@rizkanugraha_',
    sessionPath: './database/sessions',
    self: false,
  },
  removeBG: [
    "NQYeJiBQ7dxsVDpd23WBGqje",
    "TcLddGhscLuqMmoPbTU6pUgo",
    "qMpQsEerZD1XsHyEgYdYSbjS",
    "rHZFy4y4Xq7KdwPsUaSY6bQK",
    "MdcsTRN25otGMiGsrFURXvPq",
    "5UdqqjTAEkj4W8YijN5KBde7",
    "WfG4wdR5vSRw9Cw3LNZFJf4b"],
  cmdMsg: {
    botNotAdmin: "command dapat digunakan jika bot admin group",
    notGroupAdmin: "command hanya dapat digunakan admin group",
    mentionedOrQuotedJid: "reply chat atau tag orang",
    groupMsg: "command hanya dapat digunakan di dalam group",
    owner: "command hanya untuk owner",
    pconly: "command hanya untuk pc only"
  },
  logger: {
    level: 'info'
  },
  tele: {
    TELEGRAM_TOKEN: "7352968097:AAGnfK_e4aIevsxfoVtUUJcGNurnT0qGICk",
    ID_TELEGRAM: "5403773303"
  }
}
