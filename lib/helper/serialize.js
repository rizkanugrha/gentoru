
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

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
import _ from "lodash";
import util from 'util'

import { download, escapeRegExp } from '../lib/function.js';
import config from './config.js'
import { toAudio1 } from '../lib/converter.js'
import { parsePhoneNumber } from 'libphonenumber-js/max';
import db from '../database.js'

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
//https://baileys.wiki/docs/migration/to-v7.0.0
let lidStore = null;

/**
 * Inisialisasi LID store (sekali jalan)
 */
export function initLidStore(client) {
	try {
		lidStore = client.signalRepository?.getLIDMappingStore?.();
		if (!lidStore) {
			//console.warn("[LID] getLIDMappingStore tidak tersedia");
		}
	} catch (err) {
		//console.error("[LID] Error ambil getLIDMappingStore:", err);
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
		lidToJid: {
			async value(lid) {
				if (!lidStore) return null;
				try {
					const target = lid.endsWith("@lid") ? lid : `${lid}@lid`;
					const res = await lidStore.getPNForLID(target);
					return res ? jidNormalizedUser(res) : null;
				} catch (err) {
					console.error(`[LID→JID] Error untuk ${lid}:`, err);
					return null;
				}
			},
			enumerable: true
		},

		jidToLid: {
			async value(jid) {
				if (!lidStore) return null;
				try {
					const target = jid.endsWith("@s.whatsapp.net") ? jid : `${jid}@s.whatsapp.net`;
					const res = await lidStore.getLIDForPN(target);
					return res ? res : null;
				} catch (err) {
					console.error(`[JID→LID] Error untuk ${jid}:`, err);
					return null;
				}
			},
			enumerable: true
		},


		decodeJid: {
			async value(jid) {
				if (!jid) return "";
				try {
					if (/^\d+@s\.whatsapp\.net$/.test(jid) || jid.endsWith("@g.us")) {
						return jid;
					}
					if (jid.endsWith("@lid")) {
						const pure = jid.replace(/@lid$/, "");
						try {
							const res = await client.lidToJid(pure);
							if (res) return await client.decodeJid(res);
						} catch {
							return jid;
						}
					}
					if (jid.includes(":")) {
						const base = jid.split(":")[0];
						if (/^\d+$/.test(base)) {
							const norm = base + "@s.whatsapp.net";
							return await client.decodeJid(norm);
						}
					}
					if (/^\d+@\d+$/.test(jid)) {
						const norm = jid.split("@")[0] + "@s.whatsapp.net";
						return norm;
					}
					return jid;
				} catch {
					return jid || "";
				}
			}
		},

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

	//let M = proto.WebMessageInfo
	m.message = parseMessage(msg.message);

	if (msg.key) {
		m.key = msg.key;
		let rawFrom = msg.key.remoteJid.startsWith('status')
			? msg.key?.participant || msg.participant
			: msg.key.remoteJid;

		// Auto-konversi LID ke JID
		m.from = await client.decodeJid(rawFrom);
		m.fromMe = m.key.fromMe;
		m.id = m.key.id;
		m.device = /^3A/.test(m.id) ? 'ios' : m.id.startsWith('3EB') ? 'web' : /^.{21}/.test(m.id) ? 'android' : /^.{18}/.test(m.id) ? 'desktop' : 'unknown';
		m.isBot = (m.id.startsWith("BAE5") && m.id.length === 16) || (m.id.startsWith("3EB0") && m.key.id.length === 12)
		m.isGroup = m.from.endsWith('@g.us') || isJidGroup(m.key.remoteJid);
		const rawPart = msg?.participant || m.key.participant;
		m.participant = rawPart ? await client.decodeJid(rawPart) : null;

		// sender selalu JID normal
		m.sender = m.fromMe
			? await client.decodeJid(client.user.id)
			: m.isGroup
				? m.participant
				: m.from;
	}

	const senderJid = jidNormalizedUser(m.sender);
	const contactName = client.getName(senderJid);
	m.pushName =
		contactName ||
		senderJid.split('@')[0];



	const JidOwn = (JSON.parse(process.env.OWNER) ?? []).map(
		(num) => num.replace(/\D/g, "") + "@s.whatsapp.net"
	);
	const LidOwn = (JSON.parse(process.env.LIDOWN) ?? [])
		.filter((lid) => lid && lid.trim() !== "")
		.map((lid) => lid.replace(/\D/g, "") + "@lid");
	//JSON.parse(process.env.OWNER).includes(m.sender.replace(/\D+/g, ''));
	m.isOwner = JidOwn.includes(m.sender) || LidOwn.includes(m.sender)

	if (m.isGroup) {
		m.metadata = normalizeGroupMeta(await client.groupMetadata(m.from));
		m.gcName = m.isGroup ? m.metadata?.subject : '';
		m.groupMember = m.isGroup ? m.metadata?.participants : [];
		m.ownerGroup = m.isGroup && m.metadata?.owner
			? await client.decodeJid(m.metadata?.owner)
			: "";

		m.groupAdmins = m.isGroup && await Promise.all(
			(m.metadata?.participants ?? [])
				.filter((p) => p.admin === "admin" || p.admin === "superadmin")
				.map((p) => client.decodeJid(p.id))
		);
		m.isAdmin = m.isGroup && !!m.groupAdmins.find(member => member.id === m.sender);
		m.isBotAdmin = m.isGroup && !!m.groupAdmins.find(member => member.id === jidNormalizedUser(client.user.id) || client.decodeJid(client.user.id));
	}


	if (m.message) {
		m.type = getContentType(m.message) || Object.keys(m.message)[0];
		m.msg = parseMessage(m.message[m.type]) || m.message[m.type];
		m.mentions = [...(m.msg?.contextInfo?.mentionedJid || []), ...(m.msg?.contextInfo?.groupMentions?.map(v => v.groupJid) || [])];
		m.body = m.msg?.text ||
			m.msg?.conversation || m.msg?.caption ||
			m.message?.conversation || m.msg?.selectedButtonId ||
			m.msg?.singleSelectReply?.selectedRowId || m.msg?.selectedId ||
			m.msg?.contentText || m.msg?.selectedDisplayText || m.msg?.title ||
			m.msg?.name || m.msg?.description || m.msg?.buttonText || m.msg?.extendedTextMessage?.text ||
			m.msg?.buttonsResponseMessage?.selectedDisplayText ||
			m.msg?.listResponseMessage?.title || m.msg?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
			(m.msg?.interactiveMessage?.body?.text || m.msg?.interactiveMessage?.footer?.text) ||
			(m.msg?.pollCreationMessage?.name || m.msg?.pollUpdateMessage?.name) || '';
		m.prefix = config.prefix //new RegExp('^[^]', 'gi').test(m.body) ? m.body.match(new RegExp('^[^]', 'gi'))[0] : '';
		m.isCmd = m.body.startsWith(config.prefix)
		m.command = m.body && m.body.trim().replace(m.prefix, '').trim().split(/ +/).shift();
		m.args =
			m.body
				.trim()
				.replace(new RegExp('^' + escapeRegExp(m.prefix), 'i'), '')
				.replace(m.command, '')
				.split(/ +/)
				.filter(a => a) || [];
		m.text = m.args.join(' ').trim();
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

			if (m.quoted.message) {
				m.quoted.type =
					getContentType(m.quoted.message) ||
					Object.keys(m.quoted.message)[0];
				m.quoted.msg = parseMessage(m.quoted.message[m.quoted.type]) || m.quoted.message[m.quoted.type];
				m.quoted.isMedia = !!m.quoted.msg?.mimetype || !!m.quoted.msg?.thumbnailDirectPath;
				m.quoted.key = {
					remoteJid: m.msg.contextInfo.remoteJid || m.from,
					participant: m.msg.contextInfo.participant
						? await client.decodeJid(m.msg.contextInfo.participant)
						: undefined,
					fromMe:
						m.msg.contextInfo.participant &&
						areJidsSameUser(
							jidNormalizedUser(m.msg.contextInfo.participant),
							jidNormalizedUser(client?.user?.id)
						),
					id: m.msg.contextInfo.stanzaId
				};
				m.quoted.from = /g\.us|status/.test(m.msg?.contextInfo?.remoteJid) ? m.quoted.key.participant : m.quoted.key.remoteJid;
				m.quoted.fromMe = m.quoted.key.fromMe;
				m.quoted.id = m.msg?.contextInfo?.stanzaId;
				m.quoted.device = /^3A/.test(m.quoted.id) ? 'ios' : /^3E/.test(m.quoted.id) ? 'web' : /^.{21}/.test(m.quoted.id) ? 'android' : /^.{18}/.test(m.quoted.id) ? 'desktop' : 'unknown';
				m.quoted.isBot = (m.quoted.id.startsWith("BAE5") && m.quoted.id.length === 16) || (m.quoted.id.startsWith("3EB0") && m.quoted.id.length === 12)
				m.quoted.isGroup = m.quoted.from.endsWith('@g.us') || isJidGroup(m.quoted.key.remoteJid);
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


				m.quoted.prefix = config.prefix
				m.quoted.command = m.quoted.body && m.quoted.body.replace(m.quoted.prefix, '').trim().split(/ +/).shift();
				m.quoted.args =
					m.quoted.body
						.trim()
						.replace(new RegExp('^' + escapeRegExp(m.quoted.prefix), 'i'), '')
						.replace(m.quoted.command, '')
						.split(/ +/)
						.filter(a => a) || [];
				m.quoted.text = m.quoted.args.join(' ').trim() || m.quoted.body;
				m.quoted.isOwner = m.quoted.sender && JSON.parse(process.env.OWNER).includes(m.quoted.sender.replace(/\D+/g, ''));
				m.quoted.download = async function download() { return (m.quoted.type || m.quoted.msg?.thumbnailDirectPath) ? await downloadMediaMessage(m.quoted, 'buffer', { reuploadRequest: client.updateMediaMessage }) : Buffer.from(m.quoted.body, 'utf-8') };
				m.quoted.react = async (reaction) => await client.sendMessage(m.from, {
					react: {
						text: reaction,
						key: m.quoted.key,
					}
				})


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
