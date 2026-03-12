import { jidNormalizedUser } from 'baileys';
import config from '../../config.js';

export class MessageProcessor {
    /**
     * @param {import('./command.js').CommandHandler} commandHandler 
     * @param {import('./serialize.js').MessageSerializer} serializer 
     */
    constructor(commandHandler, serializer) {
        this.cmd = commandHandler;
        this.serializer = serializer;
    }

    async process(sock, msg, db) {
        const { key, message } = msg;
        if (!key || !message) return;

        const isLid = key.addressingMode === 'lid';
        const jid = (isLid ? (key.remoteJidAlt || key.remoteJid) : key.remoteJid) || key.remoteJid;
        if (!jid) return;

        const isGroup = jid.endsWith('@g.us');
        const isPrivate = !isGroup;
        const participantJid = isGroup
            ? (isLid
                ? (key.participantAlt || msg.participantAlt || key.participant || msg.participant)
                : (key.participant || msg.participant))
            : jid;
        const participant = participantJid || jid;

        const body = this.serializer.getTextFromMessage(message);
        let text = body.trim();
        let command = null;
        let args = [];
        const botJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : '';

        for (const [cmdName, cmdData] of this.cmd.commands.entries()) {
            if (cmdData.noPrefix) {
                const cmdIsAlphaNum = /^[a-z0-9]+$/i.test(cmdName);
                if (text === cmdName || text.startsWith(cmdName + ' ') || (!cmdIsAlphaNum && text.startsWith(cmdName))) {
                    command = cmdData;
                    const remainingText = text.substring(cmdName.length).trim();
                    args = remainingText ? remainingText.split(' ') : [];
                    break;
                }
            }
        }

        if (!command && text.startsWith(this.cmd.prefix)) {
            const parts = text.substring(this.cmd.prefix.length).trim().split(' ');
            const cmdName = parts[0].toLowerCase();
            args = parts.slice(1);

            if (this.cmd.commands.has(cmdName)) {
                command = this.cmd.commands.get(cmdName);
            }
        }

        let groupMetadata = {};
        let groupAdmins = [];
        let groupMember = [];
        let isAdmin = false;
        let isBotAdmin = false;

        // KUNCI PERBAIKAN: Tambahkan && command
        if (isGroup && command) {
            try {
                const rawMeta = await sock.groupMetadata(jid);
                groupMetadata = normalizeGroupMeta(rawMeta);

                groupMember = groupMetadata.participants.find(p => p.id === participant);
                groupAdmins = (groupMetadata.participants || [])
                    .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                    .map(p => jidNormalizedUser(p.id));

                isAdmin = groupMember?.admin === 'admin' || groupMember?.admin === 'superadmin';
                isBotAdmin = groupAdmins.includes(botJid);
            } catch (error) {
                console.error('Error fetching group metadata:', error.message);
                return;
            }
        }

        // Serialisasi pesan utama
        const m = this.serializer.serialize(msg, false, sock, db);

        // Serialisasi pesan yang di-quote (dibalas)
        let quotedM = null;
        const contextInfo = message?.extendedTextMessage?.contextInfo ||
            message?.imageMessage?.contextInfo ||
            message?.videoMessage?.contextInfo ||
            message?.documentMessage?.contextInfo ||
            message?.audioMessage?.contextInfo ||
            message?.stickerMessage?.contextInfo;

        if (contextInfo?.quotedMessage) {
            const quotedMsgKey = contextInfo.quotedMessage?.key || {};
            const quotedRemoteJid = quotedMsgKey.remoteJid || contextInfo.remoteJid || jid;
            const quotedParticipant = quotedMsgKey.participant || contextInfo.participant;
            const quotedKey = {
                remoteJid: quotedRemoteJid,
                remoteJidAlt: quotedMsgKey.remoteJidAlt,
                fromMe: quotedMsgKey.fromMe ?? contextInfo.fromMe ?? false,
                id: quotedMsgKey.id || contextInfo.stanzaId,
                participant: quotedParticipant,
                participantAlt: quotedMsgKey.participantAlt,
                addressingMode: quotedMsgKey.addressingMode || (quotedMsgKey.remoteJidAlt ? 'lid' : undefined)
            };
            quotedM = this.serializer.serialize({ key: quotedKey, message: contextInfo.quotedMessage }, true, sock, db);
        }

        const getObj = {
            ...m,
            quoted: quotedM,
            sock, db,
            jid: m.from,
            from: m.from,
            isGroup, isPrivate,
            fromMe: m.key.fromMe,
            participant: m.key.participant,
            sender: m.sender,
            pushName: m.name,
            body: text, text: text, args,
            msg: m.msg,
            //gc
            metadata: groupMetadata,
            gcName: isGroup ? groupMetadata.subject : '',
            groupMember: groupMember,
            ownerGroup: (isGroup && groupMetadata.owner) ? jidNormalizedUser(groupMetadata.owner) : '',
            groupAdmins: groupAdmins,
            isAdmin: isAdmin,
            isBotAdmin: isBotAdmin,
            reply: async (text, options = {}) => {
                try {
                    if (options.quoted && msg && msg.key && msg.message) {
                        return await sock.sendMessage(m.from, { text }, { ...options, quoted: msg });
                    }
                    return await sock.sendMessage(m.from, { text }, { ...options, quoted: undefined });
                } catch (error) {
                    console.error('Error sending reply:', error.message);
                    try {
                        return await sock.sendMessage(m.from, { text }, { quoted: undefined });
                    } catch (retryError) {
                        console.error('Error sending reply (retry failed):', retryError.message);
                        throw error;
                    }
                }
            },
            sendMessage: async (content, options = {}) => {
                try {
                    if (options.quoted && msg && msg.key && msg.message) {
                        return await sock.sendMessage(m.from, content, { ...options, quoted: msg });
                    }
                    return await sock.sendMessage(m.from, content, { ...options, quoted: undefined });
                } catch (error) {
                    console.error('Error sending message:', error.message);
                    try {
                        return await sock.sendMessage(m.from, content, { quoted: undefined });
                    } catch (retryError) {
                        console.error('Error sending message (retry failed):', retryError.message);
                        throw error;
                    }
                }
            },
            getGroupMetadata: async () => {
                if (isGroup) {
                    return await sock.groupMetadata(m.from);
                }
                return null;
            }
        };

        // Mengeksekusi command tanpa prefix (seperti command catch-all '*')
        for (const [cmdName, cmdData] of this.cmd.commands.entries()) {
            if (cmdData.noPrefix && cmdName === '*' && !key.fromMe) {
                try { await cmdData.handler(getObj); }
                catch (error) { console.error('Response handler error:', error); }
            }
        }

        // Validasi dan eksekusi command utama
        if (command) {
            if (command.isOwner && !key.fromMe) {
                const senderJidForCheck = isGroup ? participant : jid;
                const finalSender = ((senderJidForCheck || '').split('@')[0] || '').replace(/[^0-9]/g, '');
                const owner = ((sock.user?.id?.split(':')[0] || '')).replace(/[^0-9]/g, '');
                const configOwner = sock.config?.owner || [];
                const ownerList = Array.isArray(configOwner) ? configOwner : [configOwner];
                const ownerNumbers = ownerList.map(o => o.replace(/[^0-9]/g, ''));

                if (finalSender !== owner && !ownerNumbers.includes(finalSender)) {
                    await getObj.reply(config.cmdMsg.owner);
                    return;
                };
            }

            if (command.isGc && !isGroup) {
                await getObj.reply(config.cmdMsg.groupMsg);
                return;
            }
            if (command.isPc && !isPrivate) {
                await getObj.reply(config.cmdMsg.pconly);
                return;
            }

            if (command.isAdmin && isGroup && !isAdmin) {
                await getObj.reply(config.cmdMsg.notGroupAdmin);
                return;
            }

            if (command.isBotAdmin && isGroup && !isBotAdmin) {
                await getObj.reply(config.cmdMsg.botNotAdmin);
                return;
            }

            try {
                await command.handler(getObj);
            } catch (error) {
                console.error(`[ERROR] ${command.cmd[0]}:`, error.message);
                sock.sendMessage(jid, { text: `Error: ${error.message || 'Unknown error'}` }).catch(() => { });
            }
        }
    }
}

function normalizeGroupMeta(meta) {
    return {
        id: meta?.id || "",
        notify: meta?.notify || "",
        addressingMode: meta?.addressingMode || "jid",
        subject: meta?.subject || "",
        subjectOwner: meta?.subjectOwner || "",
        subjectOwnerPn: meta?.subjectOwnerPn || "",
        subjectTime: meta?.subjectTime || 0,
        size: meta?.size || 0,
        creation: meta?.creation || 0,
        owner: meta?.owner || "",
        ownerPn: meta?.ownerPn || "",
        owner_country_code: meta?.owner_country_code || "",
        desc: meta?.desc || "",
        descId: meta?.descId || "",
        descOwner: meta?.descOwner || "",
        descOwnerPn: meta?.descOwnerPn || "",
        descTime: meta?.descTime || 0,
        linkedParent: meta?.linkedParent || "",
        restrict: !!meta?.restrict,
        announce: !!meta?.announce,
        isCommunity: !!meta?.isCommunity,
        isCommunityAnnounce: !!meta?.isCommunityAnnounce,
        joinApprovalMode: !!meta?.joinApprovalMode,
        memberAddMode: !!meta?.memberAddMode,
        participants: (meta?.participants || []).map(p => ({
            id: p?.id || "",
            phoneNumber: p?.phoneNumber || "",
            lid: p?.lid || null,
            admin: p?.admin || null
        })),
        ephemeralDuration: meta?.ephemeralDuration || null
    }
}