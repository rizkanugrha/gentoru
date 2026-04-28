
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

import { randomBytes } from "crypto"
import { fileTypeFromBuffer } from 'file-type';
const { default: Jimp } = await import('jimp')
import _ from "lodash";
import util from 'util'

import { download, escapeRegExp } from '../utils/function.js';
import config from '../../config.js'

import db from '../database.js'
import { parsePhoneNumber } from './utils.js';
import { LRUCache } from 'lru-cache';
const groupCache = new LRUCache({
	max: 100,
	ttl: 1000 * 60 * 5,
});

const parseMention = (text) => [...text.matchAll(/@?([0-9]{5,16}|0)/g)].map((v) => v[1] + S_WHATSAPP_NET);


function generateID(length = 32, id = '') {
	id += randomBytes(Math.floor((length - id.length) / 2)).toString('hex');
	while (id.length < length) id += '0';
	return id.toUpperCase();
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

export function Client({ client }) {
	const clients = Object.defineProperties(client, {

		getName: {
			value(jid) {
				let id = jidNormalizedUser(jid);
				if (!id || typeof id !== 'string') return 'none';
				if (id.endsWith('g.us')) {
					return 'Group';
				} else {
					const contact = db.get('contacts', id, {});
					return (
						contact?.name ||
						contact?.verifiedName ||
						contact?.notify ||
						parsePhoneNumber(id.split('@')[0])
					);
				}
			},
		},
		//parsePhoneNumber('+' + id.split('@')[0]).format('INTERNATIONAL')



		sendContact: {
			async value(jid, number, quoted, options = {}) {
				let list = [];
				for (let v of number) {
					if (v.endsWith('g.us')) continue;
					v = v.replace(/\D+/g, '');
					list.push({
						displayName: client.getName(v + '@s.whatsapp.net'),
						vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${client.getName(v + '@s.whatsapp.net')}\nFN:${client.getName(v + '@s.whatsapp.net')}\nitem1.TEL;waid=${v}:${v}\nEND:VCARD`,
					});
				}
				return client.sendMessage(
					jid,
					{
						contacts: {
							displayName: `${list.length} Contact`,
							contacts: list,
						},
					},
					{ quoted, ...options }
				);
			},
			enumerable: true,
		},

		parseMention: {
			value(text) {
				return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net') || [];
			},
		},

		sendText: {
			value(jid, text, quoted = "", options = {}) {
				{
					return client.sendMessage(jid, { text: text, ...options }, { quoted });
				}
			}
		},

		downloadMediaMessage: {
			async value(message, filename) {
				let media = await downloadMediaMessage(
					message,
					'buffer',
					{},
					{
						logger: pino({ timestamp: () => `,"time":"${new Date().toJSON()}"`, level: 'fatal' }).child({ class: 'client' }),
						reuploadRequest: client.updateMediaMessage,
					}
				);

				if (filename) {
					let mime = await fileTypeFromBuffer(media);
					let filePath = path.join(process.cwd(), `src/assets/temp/${filename}.${mime.ext}`);
					fs.promises.writeFile(filePath, media);
					return filePath;
				}

				return media;
			},
			enumerable: true,
		},


		sendFile: {
			async value(jid, filePath, quoted, options = {}) {
				const mime = options.mimetype || 'application/octet-stream';
				const type = options.type || 'document';
				const name = options.fileName || path.basename(filePath);
				const stream = fs.createReadStream(filePath);

				const msg = {
					[type]: stream,
					mimetype: mime,
					fileName: name,
					...options
				};

				return client.sendMessage(jid, msg, { quoted });
			},
			enumerable: true
		},

		sendFileFromUrl: {
			async value(jid, url, caption = '', quoted = '', mentionedJid = [], ext = '', options = {}, axiosOptions = {}) {
				let filepath;
				try {
					const { filepath: downloaded, mimetype } = await download(url, ext, axiosOptions);
					filepath = downloaded;
					const mime = mimetype.split('/')[0];

					const thumb = await generateThumbnail(filepath, mime, {
						logger: pino({ timestamp: () => `,"time":"${new Date().toJSON()}"`, level: 'fatal' })
					});

					const message = await prepareWAMessageMedia({ [mime]: { url: filepath }, caption, jpegThumbnail: thumb.thumbnail, ...options }, { upload: client.waUploadToServer });
					const wa = generateWAMessageFromContent(jid, { [`${mime}Message`]: message[`${mime}Message`] }, { quoted });
					await client.relayMessage(jid, wa.message, { messageId: wa.key.id });

					fs.unlink(filepath, err => err && console.error(`Gagal hapus file: ${filepath}`));
				} catch (err) {
					console.error('sendFileFromUrl error:', err);
					if (filepath) fs.unlink(filepath, () => { });
					client.sendMessage(jid, { text: `Terjadi kesalahan: ${util.format(err)}` }, { quoted });
				}
			},
			enumerable: true
		},

		sendFilek: {
			async value(jid, file, filename = '', caption = '', quoted, ptt = false, options = {}) {
				let { mime, ext } = await fileTypeFromBuffer(file) || {};
				let mtype = 'document';

				if (/image/.test(mime)) mtype = options.asSticker ? 'sticker' : 'image';
				else if (/video/.test(mime)) mtype = 'video';
				else if (/audio/.test(mime)) mtype = 'audio';

				if (options.asDocument) mtype = 'document';

				const msg = {
					[mtype]: { url: file },
					caption,
					mimetype: mime,
					fileName: filename || `file.${ext}`,
					ptt,
					...options
				};

				return await client.sendMessage(jid, msg, { quoted });
			},
			enumerable: true
		},

		getFile: {
			/**
				   * getBuffer hehe
				   * @param {fs.PathLike} PATH
				   * @param {Boolean} saveToFile
				   */
			async value(PATH, saveToFile = false) {
				let res; let filename;
				const data = Buffer.isBuffer(PATH) ? PATH : PATH instanceof ArrayBuffer ? PATH.toBuffer() : /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split`,`[1], 'base64') : /^https?:\/\//.test(PATH) ? await (res = await fetch(PATH)).buffer() : fs.existsSync(PATH) ? (filename = PATH, fs.readFileSync(PATH)) : typeof PATH === 'string' ? PATH : Buffer.alloc(0);
				if (!Buffer.isBuffer(data)) throw new TypeError('Result is not a buffer');
				const type = await fileTypeFromBuffer(data) || {
					mime: 'application/octet-stream',
					ext: '.bin',
				};
				if (data && saveToFile && !filename) (filename = path.join(process.cwd(), './src/assets/temp' + new Date * 1 + '.' + type.ext), await fs.promises.writeFile(filename, data));
				return {
					res,
					filename,
					...type,
					data,
					deleteFile() {
						return filename && fs.promises.unlink(filename);
					},
				};
			},
			enumerable: true,
		},

		resize: {
			async value(image, width, height) {
				const imageTo = await Jimp.read(image);
				const imageOut = await imageTo.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
				return imageOut;
			}
		},




	});

	return clients;
}


export default async function serialize(client, msg) {
	const m = {};

	if (!msg.message) return;

	// oke
	if (!msg) return msg;
	let remoteJid;
	let participantJid;
	let isLid;
	//let M = proto.WebMessageInfo
	m.message = parseMessage(msg.message);

	if (msg.key) {
		m.key = msg.key;
		isLid = m.key.addressingMode === 'lid'
		remoteJid = (isLid ? (m.key.remoteJidAlt || msg.remoteJidAlt || m.key.remoteJid) : m.key.remoteJid) || m.key.remoteJid;
		//		if (!remoteJid) return null;
		m.from = remoteJid
		m.fromMe = m.key.fromMe;
		m.id = m.key.id;
		m.device = /^3A/.test(m.id) ? 'ios' : m.id.startsWith('3EB') ? 'web' : /^.{21}/.test(m.id) ? 'android' : /^.{18}/.test(m.id) ? 'desktop' : 'unknown';
		m.isBot = (m.id.startsWith("BAE5") && m.id.length === 16) || (m.id.startsWith("3EB0") && m.key.id.length === 12)
		m.isGroup = m.from.endsWith('@g.us')
		participantJid = m.isGroup
			? (isLid
				? (m.key.participantAlt || msg.participantAlt || m.key.participant || msg.participant)
				: (m.key.participant || msg.participant))
			: remoteJid;
		const senderJid = (m.isGroup ? participantJid : remoteJid) || remoteJid;

		m.participant = participantJid ? jidNormalizedUser(participantJid) : null;

		// sender selalu JID normal
		m.sender = m.fromMe
			? jidNormalizedUser(client.user.id)
			: m.isGroup
				? m.participant
				: m.from;
	}

	let name = msg.pushName
	const senderNumber = m.sender.split('@')[0];
	const jidToGet = m.sender;

	if (!name || /^\+?\d+[\s\-]?\d+[\s\-]?\d+[\s\-]?\d+$/.test(name) || /^\d+$/.test(name)) {
		if (client && client.getName) {
			const getNameResult = client.getName(jidToGet);
			if (getNameResult && getNameResult !== 'none' && getNameResult !== 'Group') {
				name = getNameResult;
				if (/^\+?\d+[\s\-]?\d+[\s\-]?\d+[\s\-]?\d+$/.test(name) || /^\d+$/.test(name)) {
					name = senderNumber;
				}
			} else {
				name = senderNumber;
			}
		} else if (db) {
			const contact = db.get('contacts', jidToGet, {});
			name = contact?.name || contact?.verifiedName || contact?.notify;
			if (!name || /^\+?\d+[\s\-]?\d+[\s\-]?\d+[\s\-]?\d+$/.test(name) || /^\d+$/.test(name)) {
				name = senderNumber;
			}
		} else {
			name = senderNumber;
		}
	}

	m.name = name
	//console.log(m.name);

	const clean = v => (v || '').toString().replace(/\D/g, '');
	const sender = clean(m.sender?.split('@')[0]);
	const bot = clean(client.user?.id?.split(':')[0]);
	const owners = (
		Array.isArray(client.config?.owner)
			? client.config.owner
			: [client.config?.owner]
	)
		.filter(Boolean)
		.map(clean);
	m.isOwner = sender === bot || owners.includes(sender);

	if (m.isGroup) {

		let metadata = groupCache.get(m.from);

		if (!metadata) {
			try {
				const rawMetadata = await client.groupMetadata(m.from);
				metadata = normalizeGroupMeta(rawMetadata);
				groupCache.set(m.from, metadata); // lru-cache otomatis mengurus waktu kedaluwarsa
			} catch (err) {
				console.error(`❌ Gagal mengambil metadata grup ${m.from}:`, err.message);
				metadata = {}; // Fallback agar bot tidak crash
			}
		}

		m.metadata = metadata;
		m.gcName = m.isGroup ? m.metadata?.subject : '';
		m.groupMember = m.isGroup ? m.metadata?.participants : [];
		m.ownerGroup = m.isGroup && m.metadata?.owner
			? jidNormalizedUser(m.metadata?.owner)
			: "";

		m.groupAdmins = m.isGroup && await Promise.all(
			(m.metadata?.participants ?? [])
				.filter((p) => p.admin === "admin" || p.admin === "superadmin")
				.map((p) => p.id)
		);
		m.isAdmin = m.isGroup && m.groupAdmins.includes(m.sender);
		m.isBotAdmin = m.isGroup && m.groupAdmins.includes(jidNormalizedUser(client.user.id));
	}

	if (m.message) {
		m.type = getContentType(m.message) || Object.keys(m.message)[0];
		m.msg = parseMessage(m.message[m.type]) || m.message[m.type];
		m.mentions = [...(m.msg?.contextInfo?.mentionedJid || []), ...(m.msg?.contextInfo?.groupMentions?.map(v => v.groupJid) || [])];
		m.body = m.msg?.text ||
			m.msg?.conversation || m.message?.conversation || m.message?.extendedTextMessage?.text || m.msg?.caption || m.msg?.selectedButtonId ||
			m.msg?.singleSelectReply?.selectedRowId || m.msg?.selectedId ||
			m.msg?.contentText || m.msg?.selectedDisplayText || m.msg?.title ||
			m.msg?.name || m.msg?.description || m.msg?.buttonText || m.msg?.extendedTextMessage?.text ||
			m.msg?.buttonsResponseMessage?.selectedDisplayText ||
			m.msg?.listResponseMessage?.title || m.msg?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
			(m.msg?.interactiveMessage?.body?.text || m.msg?.interactiveMessage?.footer?.text) ||
			(m.msg?.pollCreationMessage?.name || m.msg?.pollUpdateMessage?.name) || m.msg?.body?.text || m.msg?.paramsJson || '';

		const prefix = Array.isArray(config.bot.prefix)
			? config.bot.prefix
			: [config.bot.prefix]

		m.prefix = prefix.find(p => m.body?.startsWith(p)) || null
		m.isCmd = !!m.prefix

		if (m.isCmd) {
			const args = m.body.slice(m.prefix.length).trim().split(/ +/)
			m.command = args.shift().toLowerCase()
			m.args = args
		} else {
			m.command = null
			m.args = []
		}

		m.text = m.args.join(" ")
		m.expiration = m.msg?.contextInfo?.expiration || 0;
		m.timestamps = (typeof msg.messageTimestamp === "number" ? msg.messageTimestamp : msg.messageTimestamp.low ? msg.messageTimestamp.low : msg.messageTimestamp.high) * 1000 || Date.now()
		m.download = async function download() {
			return (m.type || downloadMediaMessage(m.msg) ||
				m.msg.thumbnailDirectPath) ? await downloadMediaMessage(msg, 'buffer', { reuploadRequest: client.updateMediaMessage }) : Buffer.from(m.body, 'utf-8')
		};
		m.react = async (reaction) => await client.sendMessage(m.from, {
			react: {
				text: reaction,
				key: m.key,
			}
		})

		m.isMedia = !!m.msg?.mimetype || !!m.msg?.thumbnailDirectPath;
		m.url = (m.body.match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi) || [])[0] || '';

		//quotedd
		m.isQuoted = false;
		if (m.msg?.contextInfo?.quotedMessage) {
			m.isQuoted = true;
			m.quoted = {};
			m.quoted.message = parseMessage(m.msg?.contextInfo?.quotedMessage);
			const quotedMsgKey = m.msg.contextInfo.quotedMessage?.key || {};

			if (m.quoted.message) {
				m.quoted.type =
					getContentType(m.quoted.message) ||
					Object.keys(m.quoted.message)[0];
				m.quoted.msg = parseMessage(m.quoted.message[m.quoted.type]) || m.quoted.message[m.quoted.type];
				m.quoted.isMedia = !!m.quoted.msg?.mimetype || !!m.quoted.msg?.thumbnailDirectPath;
				m.quoted.key = {
					remoteJid: m.msg.contextInfo.remoteJid || quotedMsgKey.remoteJid,
					remoteJidAlt: quotedMsgKey.remoteJidAlt,
					participant: m.msg.contextInfo.participant
						? jidNormalizedUser(m.msg.contextInfo.participant)
						: undefined,
					participantAlt: quotedMsgKey.participantAlt,
					fromMe:
						m.msg.contextInfo.participant ?? quotedMsgKey.fromMe ?? false,
					id: m.msg.contextInfo.stanzaId || quotedMsgKey.id,
					addressingMode: quotedMsgKey.addressingMode || (quotedMsgKey.remoteJidAlt ? 'lid' : undefined)
				};
				m.quoted.from = /g\.us|status/.test(m.quoted.key.remoteJid) ? m.quoted.key.participant : m.quoted.key.remoteJid;
				m.quoted.fromMe = m.quoted.key.fromMe;
				m.quoted.id = m.msg?.contextInfo?.stanzaId;
				m.quoted.device = /^3A/.test(m.quoted.id) ? 'ios' : /^3E/.test(m.quoted.id) ? 'web' : /^.{21}/.test(m.quoted.id) ? 'android' : /^.{18}/.test(m.quoted.id) ? 'desktop' : 'unknown';
				m.quoted.isBot = (m.quoted.id.startsWith("BAE5") && m.quoted.id.length === 16) || (m.quoted.id.startsWith("3EB0") && m.quoted.id.length === 12)
				m.quoted.participant = jidNormalizedUser(m.msg?.contextInfo?.participant) || false;
				m.quoted.sender = jidNormalizedUser(m.msg?.contextInfo?.participant || m.quoted.from);
				m.quoted.mentions = [
					...(m.quoted.msg?.contextInfo?.mentionedJid || []),
					...(m.quoted.msg?.contextInfo?.groupMentions?.map(
						v => v.groupJid
					) || [])
				];
				m.quoted.body = m.quoted.msg?.text ||
					m.quoted.msg?.conversation || m.quoted.msg?.caption ||
					m.quoted.message?.conversation || m.quoted.msg?.selectedButtonId ||
					m.quoted.msg?.singleSelectReply?.selectedRowId || m.quoted.msg?.selectedId ||
					m.quoted.msg?.contentText || m.quoted.msg?.selectedDisplayText || m.quoted.msg?.title ||
					m.quoted.msg?.name || m.quoted.msg?.description || m.quoted.msg?.buttonText || m.quoted.msg?.extendedTextMessage?.text ||
					m.quoted.msg?.buttonsResponseMessage?.selectedDisplayText ||
					m.quoted.msg?.listResponseMessage?.title || m.quoted.msg?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
					(m.quoted.msg?.pollCreationMessage?.name || m.quoted.msg?.pollUpdateMessage?.name) || '';


			}
		}
	}

	m.reply = async (text, options = {}) => {
		if (typeof text === 'string') {
			return await client.sendMessage(m.from, { text, ...options }, { quoted: m, ephemeralExpiration: m.expiration, ...options });
		} else if (typeof text === 'object' && typeof text !== 'string') {
			return client.sendMessage(m.from, { ...text, ...options }, { quoted: m, ephemeralExpiration: m.expiration, ...options });
		}
	};


	return m;
}

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
		message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
		(message?.interactiveMessage?.body?.text || message?.interactiveMessage?.footer?.text) ||
		(message?.pollCreationMessage?.name || message?.pollUpdateMessage?.name) || '';
}