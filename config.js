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
        name: 'gentoru',
        prefix: '!',
        owner: [
            "nomermu"
        ],
        no_bot: "nomerbot",
        packname: 'gentoru',
        author: '@rizkanugraha_',
        sessionPath: './database/sessions',
        self: false,
    },
    removeBG: [],
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
        TELEGRAM_TOKEN: "",
        ID_TELEGRAM: ""
    }
}
