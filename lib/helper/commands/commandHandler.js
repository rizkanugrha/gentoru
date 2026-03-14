import { Collection } from "./collections.js"
import config from "../../../config.js"

export class CommandHandler {

  constructor(client) {
    this.client = client
    this.commands = new Collection()
    this.prefix = config.bot.prefix
    this.cooldowns = new Collection()
  }

  on(command) {

    if (!command || !command.cmd) return

    const aliases = Array.isArray(command.cmd)
      ? command.cmd
      : [command.cmd]

    for (const alias of aliases) {
      this.commands.set(alias.toLowerCase(), command)
    }

  }

  get(cmd) {

    if (!cmd) return null

    return this.commands.get(cmd.toLowerCase())

  }

  async run(command, m, ctx) {

    if (!command) return
    if (typeof command.execute !== "function") return

    const name = command.name || command.cmd[0]

    const user = m.sender
    const now = Date.now()

    const cd = command.cooldown || 3

    if (!this.cooldowns.has(name)) {
      this.cooldowns.set(name, new Collection())
    }

    const timestamps = this.cooldowns.get(name)

    const expire = timestamps.get(user)

    if (expire && now < expire) {

      const left = ((expire - now) / 1000).toFixed(1)

      return m.reply(`⏳ Tunggu ${left}s lagi`)

    }

    timestamps.set(user, now + cd * 1000)

    try {

      await command.execute(m, ctx)

    } catch (err) {

      console.error(`Command Error: ${name}`, err)

      m.reply("❌ Terjadi error saat menjalankan command")

    }

  }

}
