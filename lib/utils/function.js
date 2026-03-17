
import axios from 'axios';
import FormData from 'form-data';
import moment from 'moment';
import { Readable } from 'stream';
import { fileTypeFromBuffer } from 'file-type';
import {
	existsSync,
	mkdirSync,
	writeFileSync,
	readFileSync,
	watchFile,
	unwatchFile,
	readdirSync,
	statSync
} from 'fs';
import { S_WHATSAPP_NET, getHttpStream, toBuffer } from 'baileys';
import config from '../../config.js';

if (!existsSync('./src/assets/temp')) mkdirSync('./src/assets/temp', { recursive: true });

export const getRandom = (ext = '') => `${Math.floor(Math.random() * 10000)}.${ext}`;


export const shortener = (url) => {
	return new Promise(async (resolve, reject) => {
		console.log('Creating short url...')
		await fetch(`https://tinyurl.com/api-create.php?url=${url}`)
			.then(response => response.text())
			.then(json => {
				resolve(json)
			})
			.catch((err) => {
				reject(err)
			});
	})
};

export const download = async (url, extension, optionsOverride = {}) => {
	const stream = await getHttpStream(url, optionsOverride);
	const buffer = await toBuffer(stream);
	const type = await fileTypeFromBuffer(buffer);
	const filepath = `./src/assets/temp/${Date.now()}.${extension || type.ext}`;
	writeFileSync(filepath, buffer.toString('binary'), 'binary');
	return { filepath, mimetype: type.mime };
};

export async function fetchBuffer(url, options = {}) {
	const { data, headers } = await axios.get(url, {
		headers: {
			'User-Agent': 'Mozilla/5.0',
			...(options.headers || {})
		},
		responseType: 'stream',
		...options
	});
	const buffer = await toBuffer(data);
	const name = headers['content-disposition']?.match(/filename=(?:"(.*?)"|(\S+))/);
	const filename = decodeURIComponent(name?.[1] || name?.[2] || 'file');
	const type = await fileTypeFromBuffer(buffer);
	return { data: buffer, filename, mimetype: type?.mime || 'application/octet-stream', ext: type?.ext || 'bin' };
}

export const fetchJson = async (url, options = {}) => (await axios.get(url, options)).data;
export const fetchText = async (url, options = {}) => (await axios.get(url, { ...options, responseType: 'text' })).data;
export async function fetchAPI(api, params, options = {}) {
	try {
		const res = await axios({
			url: (api) + params,
			method: options.method || 'GET',
			data: options.data,
			...options
		});
		return res.data;
	} catch (error) {
		throw new Error(error);
	}
}

export const isUrl = (url) => /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,9}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi.test(url);

export const upload = {
	async pomf(media) {
		media = Buffer.isBuffer(media) ? media : readFileSync(media);
		const { ext } = await fileTypeFromBuffer(media);
		const form = new FormData();
		form.append('files[]', media, `file-${Date.now()}.${ext}`);
		const { data } = await axios.post('https://pomf.lain.la/upload.php', form, { headers: form.getHeaders() });
		return data.files[0].url;
	},

	async telegra(media) {
		media = Buffer.isBuffer(media) ? media : readFileSync(media);
		const { ext } = await fileTypeFromBuffer(media);
		const form = new FormData();
		form.append('file', media, `file-${Date.now()}.${ext}`);
		const { data } = await axios.post('https://telegra.ph/upload', form, { headers: form.getHeaders() });
		return 'https://telegra.ph' + data[0].src;
	},
	async bashUpload(media) {
		try {
			media = Buffer.isBuffer(media) ? media : readFileSync(media);
			const type = await fileTypeFromBuffer(media);
			const ext = type ? type.ext : 'bin';
			const mime = type ? type.mime : 'application/octet-stream';

			const fileName = `file-${Date.now()}.${ext}`;
			const uploadUrl = `https://bashupload.app/${fileName}`;
			const { data } = await axios.put(uploadUrl, media, {
				headers: {
					'Content-Type': mime,
					'X-Expiration-Seconds': '180'
				}
			});
			const urlMatch = data.match(/(https?:\/\/[^\s]+)/);

			// Jika ketemu, ambil index ke-0 (URL-nya), jika tidak kembalikan data mentahnya
			const finalUrl = urlMatch ? urlMatch[0] : data;

			return finalUrl;
		} catch (error) {
			console.error('Error uploading file in baseuplo:', error);
		}
	},
	async tmpFiles(media) {
		try {
			media = Buffer.isBuffer(media) ? media : readFileSync(media);
			const { ext } = await fileTypeFromBuffer(media);
			const form = new FormData();
			form.append('file', media, `file-${Date.now()}.${ext}`);
			const { data } = await axios.post('https://tmpfiles.org/api/v1/upload', form, { headers: form.getHeaders() });
			const pageUrl = data.data.url;
			const directUrl = pageUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
			return directUrl
		} catch (error) {
			console.error('Error uploading file in tmpfile:', error);
		}
	},

};


export async function sendTelegram(chatId, data, options = {}) {
	try {
		let token = config.tele.TELEGRAM_TOKEN;
		const capitalizeFirstLetter = string => string.charAt(0).toUpperCase() + string.slice(1);

		const DEFAULT_EXTENSIONS = {
			audio: 'mp3',
			photo: 'jpg',
			sticker: 'webp',
			video: 'mp4',
			animation: 'mp4',
			video_note: 'mp4',
			voice: 'ogg',
		};

		let type = options?.type ? options.type : typeof data === 'string' ? 'text' : /webp/.test((await fileTypeFromBuffer(data))?.mime) ? 'sticker' : /image/.test((await fileTypeFromBuffer(data))?.mime) ? 'photo' : /video/.test((await fileTypeFromBuffer(data))?.mime) ? 'video' : /opus/.test((await fileTypeFromBuffer(data))?.mime) ? 'voice' : /audio/.test((await fileTypeFromBuffer(data))?.mime) ? 'audio' : 'document';

		let url = `https://api.telegram.org/bot${token}/send${type === 'text' ? 'Message' : capitalizeFirstLetter(type)}`;

		let form = new FormData();

		form.append('chat_id', chatId);
		if (type === 'text') form.append(type, data);
		else {
			let fileType = await fileTypeFromBuffer(data);
			form.append(type, data, `file-${Date.now()}.${DEFAULT_EXTENSIONS?.[type] || fileType?.ext}`);
			if (options?.caption) form.append('caption', options.caption);
		}

		let { data: response } = await axios.post(url, form, {
			headers: {
				'Content-Type': 'multipart/form-data',
			},
		});

		return response;
	} catch (e) {
		console.error(e);
		throw e;
	}
}

export const escapeRegExp = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const runtime = seconds => {
	seconds = Number(seconds);
	const d = Math.floor(seconds / 86400), h = Math.floor(seconds % 86400 / 3600), m = Math.floor(seconds % 3600 / 60), s = Math.floor(seconds % 60);
	return `${d ? `${d}d ` : ''}${h ? `${h}h ` : ''}${m ? `${m}m ` : ''}${s}s`;
};

export const toUpper = str => str.replace(/\b\w/g, c => c.toUpperCase());
export const formatSize = (bytes, si = true, dp = 2) => {
	const thresh = si ? 1000 : 1024;
	if (Math.abs(bytes) < thresh) return `${bytes} B`;
	const units = si ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
	let u = -1;
	do {
		bytes /= thresh;
		++u;
	} while (bytes >= thresh && u < units.length - 1);
	return `${bytes.toFixed(dp)} ${units[u]}`;
};

export function parseFileSize(input, si = true) {
	const thresh = si ? 1000 : 1024;
	const matches = input.toString().match(/^([0-9.,]*)(?:\s*)?(.*)$/);
	if (!matches) return false;
	const amount = parseFloat(matches[1].replace(',', '.'));
	const unit = matches[2];
	if (isNaN(amount)) return false;

	const units = {
		b: 1 / 8, B: 1,
		kb: thresh, mb: thresh ** 2, gb: thresh ** 3,
		tb: thresh ** 4, pb: thresh ** 5, eb: thresh ** 6
	};
	const found = Object.entries(units).find(([key]) => new RegExp(key, 'i').test(unit));
	if (!found) throw new Error(`${unit} is not a valid unit`);
	return Math.round(amount * found[1]);
}

export const formatK = (num, locale = 'id-ID') => new Intl.NumberFormat(locale, { notation: 'compact' }).format(num);
export const processTime = (timestamp, now) => moment.duration(now - timestamp * 1000).asSeconds();

export const secondsConvert = (s, h = false) => {
	const f = v => `0${Math.floor(v)}`.slice(-2), H = s / 3600, M = s % 3600 / 60;
	return (h ? [H, M, s % 60] : [M, s % 60]).map(f).join(':');
};
export const randRGB = () => Object.fromEntries(['r', 'g', 'b', 'a'].map(k => [k, Math.floor(Math.random() * 256)]));
export const maskStr = s => s.slice(0, 4) + s.slice(4, -2).replace(/\d/g, '*') + s.slice(-2);
export function cutStr(str, len = 40) {

	if (!str) return ""

	if (str.length > len) {
		return str.substring(0, len) + "..."
	}

	return str

}
