import util from "util"
import moment from "moment"
import Color from "../lib/utils/color.js"
import config from "../config.js"
import { formatLog } from "../lib/helper/utils.js"

export async function Messages(client, m, commandHandler, responseHandler) {

    try {

        if (!m) return

        //        console.log(formatLog(m, m.name))

        if (!m.body) return

        /*
        ======================
        COMMAND PARSER
        ======================
        */

        const prefix = config.bot.prefix
        const body = m.body.trim()

        const isCmd = body.startsWith(prefix)

        const args = isCmd
            ? body.slice(prefix.length).trim().split(/ +/)
            : []

        const command = isCmd
            ? args.shift().toLowerCase()
            : null

        /*
        ======================
        BASIC DATA
        ======================
        */

        const pushname = m.name || "Unknown"
        const times = m.timestamps || Date.now()

        const isOwner = m.isOwner || false
        const isGroupMsg = m.isGroup || false

        const groupMembers = m.groupMember || []
        const groupAdmins = m.groupAdmins || []

        const isGroupAdmin = m.isAdmin || false
        const isBotGroupAdmin = m.isBotAdmin || false

        const type = m.type || "text"
        const formattedTitle = m.gcName || ""

        const quoted = m.isQuoted ? m.quoted : m

        const downloadM = async filename => {
            return await client.downloadMediaMessage(quoted, filename)
        }

        /*
        ======================
        CONTEXT
        ======================
        */

        const ctx = {
            body,
            args,
            cmd: command,
            arg: args.join(" "),
            prefix,
            downloadM,

            isOwner,
            isGroupMsg,
            isGroupAdmin,
            isBotGroupAdmin,

            groupAdmins,
            groupMembers,
            formattedTitle
        }

        /*
        ======================
        LOG MESSAGE
        ======================
        */

        if (m.message && !m.isBot) {
            logMessage(isCmd, times, body, type, pushname, formattedTitle, command, args, m)
        }

        /*
        ======================
        RESPONSE HANDLER
        ======================
        */

        if (responseHandler?.responses?.size) {

            for (const response of responseHandler.responses.values()) {

                try {

                    await responseHandler.run(response, m, ctx)

                } catch (e) {

                    console.log(
                        Color.redBright(`[ERR RESPONSE] ${response.name}:`),
                        e
                    )

                }

            }

        }

        /*
        ======================
        COMMAND CHECK
        ======================
        */

        if (!isCmd) return

        const cmdPlugin = commandHandler.get(command)

        if (!cmdPlugin) return

        /*
        ======================
        PERMISSION CHECK
        ======================
        */

        if (cmdPlugin?.pconly && isGroupMsg)
            return m.reply(`⚙️ ${config.cmdMsg.pconly}`)

        if (cmdPlugin?.group && !isGroupMsg)
            return m.reply(`⚙️ ${config.cmdMsg.groupMsg}`)

        if (cmdPlugin?.admin && isGroupMsg && !isGroupAdmin)
            return m.reply(`⚙️ ${config.cmdMsg.notGroupAdmin}`)

        if (cmdPlugin?.botAdmin && isGroupMsg && !isBotGroupAdmin)
            return m.reply(`⚙️ ${config.cmdMsg.botNotAdmin}`)

        if (cmdPlugin?.owner && !isOwner)
            return m.reply(`⚙️ ${config.cmdMsg.owner}`)

        if (typeof cmdPlugin.execute !== "function") return

        /*
        ======================
        COMMAND EXECUTION
        ======================
        */

        try {

            await commandHandler.run(cmdPlugin, m, ctx)

        } catch (e) {

            console.log("[ERR CMD] :", Color.redBright(e))

            console.log(
                Color.redBright("[ERR CMD]"),
                Color.cyan(` ~> ${command} [${body.length}] from ${pushname}`),
                Color.yellowBright(isGroupMsg ? `in ${formattedTitle}` : "in Private")
            )

            await client.sendMessage(
                "6285314240519@s.whatsapp.net",
                { text: `Error fitur ${command}\n\n${util.format(e)}` }
            )

        }

    } catch (err) {

        console.log(Color.redBright("[FATAL MESSAGE ERROR]"), err)

        if (m?.reply) {
            await m.reply(util.format(err))
        }

    }

}

/*
======================
MESSAGE LOGGER
======================
*/

function logMessage(isCmd, times, body, type, pushname, formattedTitle, cmd, args, m) {

    const timestamp = moment(times).format("DD/MM/YYYY HH:mm:ss")

    const location = m.isGroup
        ? `in ${formattedTitle}`
        : "in Private"

    if (isCmd) {

        console.log(
            Color.greenBright(`[CMD] ${timestamp}`),
            Color.blueBright(`~> ${cmd} [${args.length}] ${cutStr(body)} from ${pushname}`),
            Color.greenBright(location)
        )

    } else {

        console.log(
            Color.yellowBright(`[MSG] ${timestamp}`),
            Color.cyan(`~> ${cutStr(body)} (${type}) from ${pushname}`),
            Color.yellowBright(location)
        )

    }

}

function cutStr(str, len = 40) {

    if (!str) return ""

    if (str.length > len) {
        return str.substring(0, len) + "..."
    }

    return str

}
