import util from "util"
import moment from "moment"
import Color from "../lib/utils/color.js"
import config from "../config.js"
import { formatLog } from "../lib/helper/utils.js"

export async function Messages(client, m, commandHandler, responseHandler) {

    try {
        if (!m) return

        const body = typeof m.body === "string" ? m.body.trim() : ""
        //if (!body) return


        const prefix = m.prefix
        let isCmd = m.isCmd
        let args = m.args || []
        let command = m.command
        let cmdPlugin = null

        if (isCmd) {

            args = body.slice(prefix.length).trim().split(/ +/)
            command = args.shift()?.toLowerCase()

            cmdPlugin = commandHandler.get(command)

        } else {

            // noPrefix command
            const firstWord = body.split(" ")[0].toLowerCase()

            for (const plugin of commandHandler.commands.values()) {

                if (!plugin.noPrefix) continue

                if (plugin.cmd && plugin.cmd.includes(firstWord)) {

                    cmdPlugin = plugin
                    command = firstWord
                    args = body.split(" ").slice(1)

                    isCmd = true
                    break

                }

            }

        }

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
            cmds: command,
            arg: args.join(" "),
            prefix,
            downloadM,
            text: body,

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

        if (!isCmd) return
        if (!cmdPlugin) return
        if (config.bot.self === true && !isOwner) return
        if (m.key.remoteJid === 'status@broadcast') return;
        if (m.type === 'protocolMessage' && m.message.protocolMessage.type === 0) return;


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