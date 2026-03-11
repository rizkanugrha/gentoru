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
    name: 'BotWA',
    prefix: '.',
    owner: ["6285314240519"],
    sessionPath: './database/sessions'
  },
  logger: {
    level: 'info'
  }
}
