import { downloadMediaMessage, generateThumbnail, generateWAMessageFromContent, jidNormalizedUser, prepareWAMessageMedia } from 'baileys';
import { fileTypeFromBuffer } from 'file-type';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
const { default: Jimp } = await import('jimp')

import { download } from '../utils/function.js';
import { parsePhoneNumber } from './utils.js';

export class SocketExtender {
    constructor(sock, db) {
        this.sock = sock;
        this.db = db;
    }

    /**
     * Tempat untuk menyuntikkan (mendaftarkan) semua custom method ke sock
     */
    extend() {
        this.sock.getName = this.getName.bind(this);
        this.sock.sendFile = this.sendFile.bind(this);
        this.sock.sendFileFromUrl = this.sendFileFromUrl.bind(this);
        this.sock.getFile = this.getFile.bind(this);

        return this.sock;
    }

    // ==========================================
    //        DAFTAR CUSTOM METHOD SOCKET
    // ==========================================
    getName(jid) {
        let id = jidNormalizedUser(jid);
        if (!id || typeof id !== 'string') return 'none';
        if (id.endsWith('g.us')) {
            return 'Group';
        } else {
            const contact = this.db.get('contacts', id, {});
            return (
                contact?.name ||
                contact?.verifiedName ||
                contact?.notify ||
                parsePhoneNumber(id.split('@')[0])
            );
        }
    }

    /**
     * sendFile(jid, pathOrBuffer, caption = '', quoted = null, options = {})
     * Mengirim file (Otomatis mendeteksi Image, Video, Audio, atau Document)
     */
    async sendFile(jid, pathOrBuffer, caption = '', quoted = null, options = {}) {
        try {
            let buffer;

            // Validasi input: Buffer atau Path String
            if (Buffer.isBuffer(pathOrBuffer)) {
                buffer = pathOrBuffer;
            } else if (typeof pathOrBuffer === 'string' && fs.existsSync(pathOrBuffer)) {
                buffer = fs.readFileSync(pathOrBuffer);
            } else {
                throw new Error('Input harus berupa Buffer atau path file yang valid (string)');
            }

            // Deteksi MIME Type otomatis
            const type = await fileTypeFromBuffer(buffer);
            const mime = type ? type.mime : 'application/octet-stream';

            // Menentukan tipe pesan berdasarkan awalan MIME
            let messageType = 'document'; // Default ke dokumen
            if (mime.startsWith('image/')) messageType = 'image';
            else if (mime.startsWith('video/')) messageType = 'video';
            else if (mime.startsWith('audio/')) messageType = 'audio';

            // Susun dan kirim pesan
            const messageContent = {
                [messageType]: buffer,
                mimetype: mime,
                caption: caption,
                ...options
            };

            return await this.sock.sendMessage(jid, messageContent, { quoted });
        } catch (error) {
            console.error('Error in sendFile:', error.message);
            throw error;
        }
    }

    async sendFileFromUrl(jid, url, caption = '', quoted = '', mentionedJid = [], ext = '', options = {}, axiosOptions = {}) {
        let filepath;
        try {
            const { filepath: downloaded, mimetype } = await download(url, ext, axiosOptions);
            filepath = downloaded;
            const mime = mimetype.split('/')[0];

            const thumb = await generateThumbnail(filepath, mime, {
                logger: pino({ timestamp: () => `,"time":"${new Date().toJSON()}"`, level: 'fatal' })
            });

            const message = await prepareWAMessageMedia({ [mime]: { url: filepath }, caption, jpegThumbnail: thumb.thumbnail, ...options }, { upload: this.sock.waUploadToServer });
            const wa = generateWAMessageFromContent(jid, { [`${mime}Message`]: message[`${mime}Message`] }, { quoted });
            await this.sock.relayMessage(jid, wa.message, { messageId: wa.key.id });

            fs.unlink(filepath, err => err && console.error(`Gagal hapus file: ${filepath}`));
        } catch (err) {
            console.error('sendFileFromUrl error:', err);
            if (filepath) fs.unlink(filepath, () => { });
            this.sock.sendMessage(jid, { text: `Terjadi kesalahan: ${util.format(err)}` }, { quoted });
        }
    }


    /**
     * getfile */
    async getFile(PATH, saveToFile = false) {
        let res; let filename;
        const data = Buffer.isBuffer(PATH) ? PATH : PATH instanceof ArrayBuffer ? PATH.toBuffer() : /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split`,`[1], 'base64') : /^https?:\/\//.test(PATH) ? await (res = await fetch(PATH)).buffer() : fs.existsSync(PATH) ? (filename = PATH, fs.readFileSync(PATH)) : typeof PATH === 'string' ? PATH : Buffer.alloc(0);
        if (!Buffer.isBuffer(data)) throw new TypeError('Result is not a buffer');
        const type = await fileTypeFromBuffer(data) || {
            mime: 'application/octet-stream',
            ext: '.bin',
        };
        if (data && saveToFile && !filename) (filename = path.join(process.cwd(), 'src/assets/temp' + new Date * 1 + '.' + type.ext), await fs.promises.writeFile(filename, data));
        return {
            res,
            filename,
            ...type,
            data,
            deleteFile() {
                return filename && fs.promises.unlink(filename);
            },
        };
    }

    /**
     * rezise
     */
    async resize(image, width, height) {
        const imageTo = await Jimp.read(image);
        const imageOut = await imageTo.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
        return imageOut;
    }

}