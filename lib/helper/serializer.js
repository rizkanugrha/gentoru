
import {
    isJidGroup,
    jidNormalizedUser,
    extractMessageContent,
    generateForwardMessageContent,
    areJidsSameUser,
    downloadMediaMessage,
    generateThumbnail,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    S_WHATSAPP_NET,
    jidDecode,
    proto
} from 'baileys'
import path from 'path';
import fs, { statSync, unlinkSync, unlink, existsSync, readFileSync, writeFileSync } from 'fs';
import pino from 'pino';


import { fileTypeFromBuffer } from 'file-type';
const { default: Jimp } = await import('jimp')

import util from 'util'

import { download, escapeRegExp } from '../utils/function.js';

function getTextFromMessage(message) {
    if (!message) return '';
    return message?.conversation ||
        message?.extendedTextMessage?.text ||
        message?.imageMessage?.caption ||
        message?.videoMessage?.caption ||
        message?.documentMessage?.caption ||
        message?.audioMessage?.caption ||
        message?.stickerMessage?.caption ||
        message?.locationMessage?.caption ||
        message?.contactMessage?.displayName ||
        message?.buttonsResponseMessage?.selectedButtonId ||
        message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        message?.templateButtonReplyMessage?.selectedId ||
        message?.listResponseMessage?.title || message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
        (message?.interactiveMessage?.body?.text || message?.interactiveMessage?.footer?.text) ||
        (message?.pollCreationMessage?.name || message?.pollUpdateMessage?.name) ||
        '';
}

function parseMessage(content) {
    content = extractMessageContent(content);

    if (content?.viewOnceMessageV2Extension)
        return content.viewOnceMessageV2Extension.message;

    if (content?.protocolMessage?.type === 14)
        return extractMessageContent(content.protocolMessage);

    if (content?.message)
        return extractMessageContent(content.message);

    return content;
}



export const getContentType = content => {
    if (content) {
        const keys = Object.keys(content);
        const key = keys.find(k => (k === 'conversation' || k.endsWith('Message') || k.includes('V2') || k.includes('V3')) && k !== 'senderKeyDistributionMessage');
        return key;
    }
};
//https://baileys.wiki/docs/migration/to-v7.0.0

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






export default async function serialize(sock, msg) {
    if (!msg || !msg.message) return msg;

    const m = {};
    m.msg = msg;
    // Menghindari error jika parseMessage tidak terdefinisi secara global
    m.message = typeof parseMessage === 'function' ? parseMessage(msg.message) : msg.message;

    if (msg.key) {
        m.key = msg.key;
        m.id = m.key.id;
        m.isBot = (m.id.startsWith("BAE5") && m.id.length === 16) || (m.id.startsWith("3EB0") && m.key.id.length === 12);
        m.device = /^3A/.test(m.id) ? 'ios' : m.id.startsWith('3EB') ? 'web' : /^.{21}/.test(m.id) ? 'android' : /^.{18}/.test(m.id) ? 'desktop' : 'unknown';
        m.fromMe = m.key.fromMe;
        m.isLid = m.key.addressingMode === 'lid';

        const remoteJid = (m.isLid ? (m.key.remoteJidAlt || msg.remoteJidAlt || m.key.remoteJid) : m.key.remoteJid) || m.key.remoteJid;
        if (!remoteJid) return null;

        m.from = remoteJid; // Define m.from
        m.isGroup = m.from.endsWith('@g.us');

        const participantJid = m.isGroup
            ? (m.isLid
                ? (m.key.participantAlt || msg.participantAlt || m.key.participant || msg.participant)
                : (m.key.participant || msg.participant))
            : m.from;

        m.sender = (m.isGroup ? participantJid : m.from) || m.from;
        const senderNumber = m.sender.split('@')[0];
        let name = msg.pushName; // Fix: pushName -> msg.pushName

        if (!name || /^\+?\d+[\s\-]?\d+[\s\-]?\d+[\s\-]?\d+$/.test(name) || /^\d+$/.test(name)) {
            if (sock && typeof sock.getName === 'function') {
                const getNameResult = sock.getName(m.sender); // Fix: sock -> sock
                if (getNameResult && getNameResult !== 'none' && getNameResult !== 'Group') {
                    name = getNameResult;
                    if (/^\+?\d+[\s\-]?\d+[\s\-]?\d+[\s\-]?\d+$/.test(name) || /^\d+$/.test(name)) {
                        name = senderNumber;
                    }
                } else {
                    name = senderNumber;
                }
            } else {
                name = senderNumber;
            }
        }
        m.pushName = name;
    }

    const owner = ((sock.user?.id?.split(':')[0] || '')).replace(/[^0-9]/g, '');
    const configOwner = sock.config?.owner || [];
    const ownerList = Array.isArray(configOwner) ? configOwner : [configOwner];
    const ownerNumbers = ownerList.map(o => o.replace(/[^0-9]/g, ''));

    m.isOwner = m.sender !== owner && !ownerNumbers.includes(m.sender)
    const botId = sock.user?.id ? jidNormalizedUser(sock.user?.id) : null;

    // --- Group Metadata ---
    if (m.isGroup) {

        m.metadata = normalizeGroupMeta(await sock.groupMetadata(m.from));
        m.gcName = m.metadata?.subject || '';
        m.groupMember = m.metadata?.participants || [];

        // Memastikan decodeJid aman dipanggil
        //const decodeJid = (jid) => typeof sock.decodeJid === 'function' ? sock.decodeJid(jid) : jid;

        m.ownerGroup = m.metadata?.owner ? jidNormalizedUser(m.metadata.owner) : "";
        m.groupAdmins = (m.metadata?.participants || [])
            .filter((p) => p.admin === "admin" || p.admin === "superadmin")
            .map((p) => jidNormalizedUser(p.id));

        m.isAdmin = !!m.groupAdmins.find(member => member === m.sender); // Memperbaiki perbandingan objek

        // Cek admin bot
        m.isBotAdmin = !!m.groupAdmins.find(member => typeof jidNormalizedUser === 'function' ? member === jidNormalizedUser(botId) : member === botId);
    }



    // --- Message Parsing ---
    if (m.message) {
        m.type = typeof getContentType === 'function' ? getContentType(m.message) : Object.keys(m.message)[0];
        m.msg = typeof parseMessage === 'function' ? parseMessage(m.message[m.type]) : (m.message[m.type] || m.message);
        m.mentions = [...(m.msg?.contextInfo?.mentionedJid || []), ...(m.msg?.contextInfo?.groupMentions?.map(v => v.groupJid) || [])];
        m.body = getTextFromMessage(m.msg) || getTextFromMessage(m.message);

        // Ambil prefix dari config jika ada, jika tidak default kosongan/regex standar
        m.prefix = '.'
        // m.prefix = (typeof config !== 'undefined' && config.prefix) ? config.prefix : /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^]/gi.test(m.body) ? m.body.match(/^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^]/gi)[0] : '';

        m.isCmd = m.body.startsWith(m.prefix);
        m.command = m.body.trim().replace(m.prefix, '').trim().split(/ +/).shift();

        m.args = m.body.trim()
            .replace(new RegExp('^' + escapeRegExp(m.prefix), 'i'), '')
            .replace(m.command, '')
            .split(/ +/)
            .filter(a => a) || [];

        m.text = m.args.join(' ').trim();
        m.expiration = m.msg?.contextInfo?.expiration || 0;
        m.timestamps = (typeof msg.messageTimestamp === "number" ? msg.messageTimestamp : (msg.messageTimestamp?.low ? msg.messageTimestamp.low : msg.messageTimestamp?.high)) * 1000 || Date.now();

        m.download = async () => {
            if (typeof downloadMediaMessage !== 'undefined') {
                return (m.type || m.msg?.thumbnailDirectPath) ? await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage }) : Buffer.from(m.body, 'utf-8');
            }
            return Buffer.from(m.body, 'utf-8');
        };

        m.react = async (reaction) => await sock.sendMessage(m.from, { react: { text: reaction, key: m.key } });

        m.isMedia = !!m.msg?.mimetype || !!m.msg?.thumbnailDirectPath;
        m.url = (m.body.match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi) || [])[0] || '';

        // --- Quoted Message ---
        m.isQuoted = false;
        if (m.msg?.contextInfo?.quotedMessage) {
            m.isQuoted = true;
            m.quoted = {};
            m.quoted.message = m.msg.contextInfo.quotedMessage;
            m.quotedMsgKey = m.msg.contextInfo.quotedMessage?.key || {};

            if (m.quoted.message) {
                m.quoted.type = getContentType(m.quoted.message);
                m.quoted.msg = m.quoted.message[m.quoted.type] || m.quoted.message;
                m.quoted.isMedia = !!m.quoted.msg?.mimetype || !!m.quoted.msg?.thumbnailDirectPath;

                m.quoted.key = {
                    remoteJid: m.msg.contextInfo.remoteJid || m.from,
                    remoteJidAlt: m.quotedMsgKey.remoteJidAlt || {},
                    participant: m.msg.contextInfo.participant ? (typeof jidNormalizedUser(m.from) === 'function' ? jidNormalizedUser(m.msg.contextInfo.participant) : m.msg.contextInfo.participant) : undefined,
                    participantAlt: m.quotedMsgKey.participantAlt,
                    fromMe: m.msg.contextInfo.fromMe && (typeof areJidsSameUser === 'function' ? areJidsSameUser(jidNormalizedUser(m.msg.contextInfo.fromMe), jidNormalizedUser(sock?.user?.id)) : m.msg.contextInfo.fromMe),
                    id: m.msg.contextInfo.stanzaId || m.quoted.id,
                    addressingMode: m.quotedMsgKey.addressingMode || (m.quotedMsgKey.remoteJidAlt ? 'lid' : undefined)
                };

                m.quoted.from = /g\.us|status/.test(m.msg?.contextInfo?.remoteJid) ? m.quoted.key.participant : m.quoted.key.remoteJid;
                m.quoted.fromMe = m.quoted.key.fromMe;
                m.quoted.id = m.msg?.contextInfo?.stanzaId;
                m.quoted.device = /^3A/.test(m.quoted.id) ? 'ios' : /^3E/.test(m.quoted.id) ? 'web' : /^.{21}/.test(m.quoted.id) ? 'android' : /^.{18}/.test(m.quoted.id) ? 'desktop' : 'unknown';
                m.quoted.isBot = (m.quoted.id?.startsWith("BAE5") && m.quoted.id?.length === 16) || (m.quoted.id?.startsWith("3EB0") && m.quoted.id?.length === 12);

                m.quoted.isGroup = m.quoted.from?.endsWith('@g.us') || (typeof isJidGroup === 'function' ? isJidGroup(m.quoted.key.remoteJid) : false);
                m.quoted.participant = typeof jidNormalizedUser === 'function' ? jidNormalizedUser(m.msg?.contextInfo?.participant) : m.msg?.contextInfo?.participant;
                m.quoted.sender = typeof jidNormalizedUser === 'function' ? jidNormalizedUser(m.msg?.contextInfo?.participant || m.quoted.from) : (m.msg?.contextInfo?.participant || m.quoted.from);

                m.quoted.mentions = [
                    ...(m.quoted.msg?.contextInfo?.mentionedJid || []),
                    ...(m.quoted.msg?.contextInfo?.groupMentions?.map(v => v.groupJid) || [])
                ];

                m.quoted.body = getTextFromMessage(m.quoted.message);
                m.quoted.prefix = m.prefix;
                m.quoted.command = m.quoted.body && m.quoted.body.replace(m.quoted.prefix, '').trim().split(/ +/).shift();
                m.quoted.args = m.quoted.body.trim().replace(new RegExp('^' + escapeRegExp(m.quoted.prefix), 'i'), '').replace(m.quoted.command, '').split(/ +/).filter(a => a) || [];
                m.quoted.text = m.quoted.args.join(' ').trim() || m.quoted.body;

                const envOwner = process.env.OWNER ? JSON.parse(process.env.OWNER) : [];
                m.quoted.isOwner = m.quoted.sender && envOwner.includes(m.quoted.sender.replace(/\D+/g, ''));

                m.quoted.download = async () => {
                    if (typeof downloadMediaMessage !== 'undefined') {
                        return (m.quoted.type || m.quoted.msg?.thumbnailDirectPath) ? await downloadMediaMessage(m.quotedMsgKey, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage }) : Buffer.from(m.quoted.body, 'utf-8');
                    }
                    return Buffer.from(m.quoted.body, 'utf-8');
                };

                m.quoted.react = async (reaction) => await sock.sendMessage(m.from, { react: { text: reaction, key: m.quoted.key } });
            }
        }
    }

    m.reply = async (text, options = {}) => {
        if (typeof text === 'string') {
            return await sock.sendMessage(m.from, { text, ...options }, { quoted: msg, ephemeralExpiration: m.expiration, ...options });
        } else if (typeof text === 'object' && typeof text !== 'string') {
            return sock.sendMessage(m.from, { ...text, ...options }, { quoted: msg, ephemeralExpiration: m.expiration, ...options });
        }
    };

    return m;
}