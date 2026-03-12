/**
 * Author  : Gimenz
 * ReModified : Rizka Nugraha
 * Name    : violet-rzk
 * Version : 2.8.24
 * Update  : 2 Agustus 2024
 * 
 * If you are a reliable programmer or the best developer, please don't change anything.
 * If you want to be appreciated by others, then don't change anything in this script.
 * Please respect me for making this tool from the beginning.
 */
import { fileTypeFromBuffer } from 'file-type';
import ffmpeg from 'fluent-ffmpeg';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import webpmux from 'node-webpmux';
const { Image } = webpmux;
import addExif, { Emoji } from './exif.js';
//import canvasGif from "canvas-gif";
import axios from 'axios'
import { randomBytes } from 'crypto';
import { join } from 'path';
import { fetchBuffer, isUrl, fetchAPI } from '../utils/function.js'
import { createCanvas, registerFont } from 'canvas'
import canvasTxt from './canvasTxt.js'
import sharp from 'sharp';
import config from '../../config.js'

import {
    removeBackgroundFromImageBase64,
    removeBackgroundFromImageUrl,
    removeBackgroundFromImageFile
} from 'remove.bg';
// import EmojiAPI from "emoji-api";
// import { join } from 'path';
// var emo = new EmojiAPI();
//ffmpeg.setFfmpegPath("C:/ffmpeg/bin/ffmpeg.exe");

let cropStyle = [
    'rounded',
    'circle',
    'nobg',
    'negate',
    'pixelate',
    'greyscale',
    'grayscale'
]

const colourspace = {
    'b-w': 'b-w',
    bw: 'b-w',
    cmyk: 'cmyk',
    srgb: 'srgb'
};

let cropType = {
    'rounded': new Buffer.from('<svg><rect x="0" y="0" width="450" height="450" rx="50" ry="50"/></svg>'),
    'circle': new Buffer.from('<svg height="485" width="485"><circle cx="242.5" cy="242.5" r="242.5" fill="#3a4458"/></svg>'),
}

cropStyle = cropStyle.concat(Object.keys(colourspace))

// some part of this code is copied from:  https://github.com/AlenSaito1/wa-sticker-formatter/ <- awesome library
class Sticker {

    /**
     * let set the sticker metadata
     * @typedef {Object} IStickerMetadata
     * @property {string} packname sticker pack name
     * @property {string} author sticker author
     * @property {string} packId sticker pack id
     * @property {string} categories sticker emoji categories
     */

    /**
     * Build an WebP WAsticker with exif metadata
     * @param {string|Buffer} data File path, url or Buffer of the image/video
     * @param {IStickerMetadata} metadata let set the sticker metadata
     * @param {string} crop crop style [just for image], can be circle | rounded
     */
    constructor(data, metadata, crop = undefined) {
        this.data = data
        this.packname = metadata.packname
        this.author = metadata.author
        this.packId = metadata.packId
        this.categories = metadata.categories
        this.crop = cropStyle.includes(crop) ? crop : undefined
    }

    /**
     * process image 
     * @param {Buffer} input
     * @returns {Promise<Buffer>} WebP Buffer
     */
    processImage = async (input) => {
        input = this.crop === 'pixelate'
            ? await sharp(input).resize(20, null, { kernel: 'nearest' }).toBuffer()
            : input
        return new Promise((resolve, reject) => {
            sharp(input)
                .negate(this.crop === 'negate')
                .greyscale(/gr(e|a)yscale/.test(this.crop))
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                })
                .toColourspace(Object.keys(colourspace).includes(this.crop) ? colourspace[this.crop] : 'srgb')
                .toFormat('webp')
                .toBuffer()
                .then(resolve)
                .catch(reject)
        })
    }

    /**
     * rotate an image
     * @param {Buffer} input buffer image
     * @param {90|180|270|"flip"|"flop"} deg max degree is 360
     * @returns {Promise<Buffer>}
     */
    static rotate = async (input, deg) => {
        if (!isNaN(deg) && deg > 360) throw 'max degrees is 360'
        return new Promise((resolve, reject) => {
            sharp(input)
                .flip(deg === 'flip')
                .flop(deg === 'flop')
                .rotate(/fl(o|i)p/.test(deg) ? 0 : parseInt(deg))
                .toFormat('png')
                .toBuffer()
                .then(resolve)
                .catch(reject)
        })
    }

    /**
     * crop image 
     * @returns {Promise<Buffer>} WebP Buffer
     */
    cropImage = (input) => {
        return new Promise((resolve, reject) => {
            sharp(input)
                .toFormat('webp')
                .resize(512, 512)
                .composite([{
                    input: cropType[this.crop],
                    blend: 'dest-in',
                    cutout: true
                }])
                .toBuffer()
                .then(resolve)
                .catch(reject)
        })
    }


    /**
     * creates meme with custom image
     * @param {string} top top text
     * @param {string} bottom bottom text
     * @param {string} backgroundUrl background image url
     * @returns {Promise<string>} url of image
     */
    static memeGenerator = async (top, bottom, backgroundUrl) => {
        const res = await fetchAPI('https://api.memegen.link', '/images/custom', {
            method: 'POST',
            data: {
                "background": backgroundUrl,
                "style": "default",
                "text_lines": [
                    top,
                    bottom
                ],
                "extension": "png",
                "redirect": false
            }
        });
        return res.url;
    };



    /**
     * convert emoji into image
     * @param {string} emoji 
     * @param {string} vendor 
     * @returns 
     */
    // static emoji = async (emoji, vendor = 'apple') => {
    //     const res = await emo.get(emoji, true)
    //     return res.images.find(x => x.vendor.toLowerCase().includes(vendor.toLowerCase()))
    // }

    /**
     * remove the background of and image. do note! that this function is only for remove the bg
     * 
     * remove.bg apikey, you can get it from -> https://www.remove.bg/api
     * also, you can use many apikey, place it on ./src/config.json and separated by comma, eg: apikey1, apikey2
     * @param {Buffer} input image buffer 
     * @returns 
     */
    static removeBG = async (input) => {
        try {


            var prbg = config.removeBG;

            var apikey = prbg[Math.floor(Math.random() * prbg.length)];
            const response = await removeBackgroundFromImageBase64({
                base64img: input.toString('base64'),
                apiKey: apikey,
                size: 'auto',
                type: 'auto',
            })
            return Buffer.from(response.base64img, 'base64')
        } catch (error) {
            throw error
        }
    }

    /**
     * remove image background and convert it into WASticker WebP
     * @param {Buffer} input 
     * @returns 
     */
    processNoBG = async (input) => {
        try {
            const buffer = await Sticker.removeBG(await this._parse(input))
            return this.processImage(buffer)
        } catch (error) {
            throw error
        }
    }

    /**
     * simple method to remove background without Api-Keys [FREE]
     * @param {Buffer} input 
     */
    static simpleRemoveBg = async (input) => {
        if (!Buffer.isBuffer(input)) throw 'Not a Buffer'
        // copied from https://github.com/open-wa/wa-automate-nodejs/blob/master/src/api/Client.ts
        const { data } = await axios.post('https://sticker-api.openwa.dev/prepareWebp', {
            image: input.toString('base64'),
            stickerMetadata: {
                removebg: true
            }
        }, {
            maxBodyLength: 20000000, // 20mb request file limit
            maxContentLength: 1500000 // 1.5mb response body limit
        })

        return Buffer.from(data.webpBase64, 'base64')
    }

    static ttp = (text) => {
        registerFont("./src/font/MouseMemoirs-Regular.ttf", { family: "MouseMemoirs-Regular" });
        const canvas = createCanvas(512, 512);
        const ctx = canvas.getContext('2d');

        // alpha bg
        ctx.fillStyle = 'rgba(0,0,0,0)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        text = wrapText(text, calculateCircumference(text.length));
        console.log(text);
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'black';
        canvasTxt.font = 'MouseMemoirs-Regular';
        canvasTxt.fontSize = 600;
        canvasTxt.align = 'center';
        canvasTxt.strokeWidth = 1.5;
        canvasTxt.lineHeight = null;
        canvasTxt.fontSize = getFontSizeToFit(ctx, text, canvas.width, canvas.height);
        canvasTxt.drawText(ctx, text, 0, 0, 512, 512);
        return canvas.toBuffer();
    }


    /**
     * convert video to WebP WASticker format
     * @param {Buffer} data video to be converted
     *   const input = `./src/assets/temp/video_${randomBytes(3).toString('hex')}.mp4`;
     *   const output = `./src/assets/temp/${randomBytes(3).toString('hex')}.webp`;
     * @returns {Promise<Buffer} WebP Buffer
     */
    processMp4ToWebp = async (data) => {
        try {
            const input = join(process.cwd(), `/src/assets/temp/video/video_${randomBytes(3).toString('hex')}.mp4`)
            const output = join(process.cwd(), `./src/assets/temp/webp/${randomBytes(3).toString('hex')}.webp`);

            // Tulis buffer data secara langsung
            writeFileSync(input, data);

            const file = await new Promise((resolve, reject) => {
                ffmpeg(input)
                    .inputOptions(['-y', '-t', '15']) // batasi maksimal 15 detik
                    .complexFilter(['scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1'])
                    .outputOptions(['-qscale', '50', '-fs', '1M', '-vcodec', 'libwebp', '-preset', 'default', '-loop', '0', '-an', '-vsync', '0'])
                    .format('webp')
                    .save(output)
                    .on('end', () => resolve(output))
                    .on('error', (err) => reject(err));
            });

            const buffer = readFileSync(file);

            // Hapus file temp setelah selesai
            [input, output].forEach((file) => {
                if (existsSync(file)) unlinkSync(file);
            });

            return buffer;
        } catch (error) {
            console.log("Error in processAnimated:", error);
            throw error;
        }
    }


    /**
     * convert GIF to WebP WASticker format
     * @param {Buffer} data gif to be converted
     * @returns {Promise<Buffer>} WebP Buffer
     */
    processGifToWebp = async (data) => {
        try {
            const input = join(process.cwd(), `/src/assets/temp/video/gif-${randomBytes(3).toString('hex')}.gif`)
            const output = join(process.cwd(), `./src/assets/temp/webp/${randomBytes(3).toString('hex')}.webp`)
            writeFileSync(input, data);

            const file = await new Promise((resolve, reject) => {
                ffmpeg(input)
                    .inputOptions(['-y'])
                    .complexFilter(['scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1'])
                    .outputOptions(['-qscale', '50', '-vcodec', 'libwebp', '-preset', 'default', '-loop', '0', '-vsync', '0'])
                    .format('webp')
                    .save(output)
                    .on('end', () => resolve(output))
                    .on('error', (err) => reject(err));
            });

            const buffer = readFileSync(file);

            [input, output].forEach((file) => {
                if (existsSync(file)) unlinkSync(file);
            });

            return buffer;
        } catch (error) {
            console.log("Error in processGif:", error);
            throw error;
        }
    }

    /**
     * parse this image to Buffer
     * @param {Buffer|string} input url | filepath | Buffer
     * @returns {Promise<Buffer>}
     */
    _parse = async (input = this.data) => {
        return Buffer.isBuffer(input)
            ? input
            : isUrl(input)
                ? (await fetchBuffer(input)).buffer
                : existsSync(input)
                    ? readFileSync(input)
                    : input
    }

    /**
     * add metadata to webp buffer
     * @param {Buffer} input webp buffer
     * @returns {Promise<Buffer>}
     */
    addMetadata = async (input) => {
        const data = input || this.data
        const exif = new addExif({ packname: this.packname, author: this.author, packId: this.packId, categories: this.categories }).create();
        const img = new Image()
        await img.load(data)
        img.exif = exif
        return await img.save(null)
    }

    /**
     * get mimetype from Buffer
     * @param {Buffer} input 
     * @returns 
     */
    _getMimeType = async (input) => {
        const type = await fileTypeFromBuffer(input)
        if (!type) {
            if (typeof this.data === 'string') return 'image/svg+xml'
            throw new Error('Invalid file type')
        }
        return type.mime
    }

    /**
     * is animated Buffer?
     * @param {Buffer} buffer 
     * @returns 
     */
    _isAnimated = (buffer) => {
        var ANIM = [0x41, 0x4E, 0x49, 0x4D]
        for (var i = 0; i < buffer.length; i++) {
            for (var j = 0; j < ANIM.length; j++) {
                if (buffer[i + j] !== ANIM[j]) {
                    break
                }
            }
            if (j === ANIM.length) {
                return true
            }
        }
        return false
    }

    /**
         * create WASticker with metadata
         * @returns {Promise<Buffer>} WebP Buffer WASticker
         */
    build = async () => {
        const data = await this._parse()
        const aww = await this._getMimeType(data);

        const isWebP = aww.includes('webp') || /webp/.test(aww);
        const isVideo = aww.startsWith('video') || /video/.test(aww);
        const isGif = aww.includes('gif') || /image\/gif/.test(aww);

        let media;
        if (isVideo) {
            media = await this.processMp4ToWebp(data);
        } else if (isGif) {
            media = await this.processGifToWebp(data);
        } else if (isWebP) {
            media = data;
        } else if (this.crop === 'nobg') {
            media = await this.processNoBG(data);
        } else if (Object.keys(cropType).includes(this.crop)) {
            media = await this.cropImage(data);
        } else {
            media = await this.processImage(data);
        }

        if (!media || !Buffer.isBuffer(media) || media.length === 0) {
            throw new Error("Gagal membuat media buffer dari FFmpeg / Sharp.");
        }

        const finalBuffer = await this.addMetadata(media);

        if (!finalBuffer || !Buffer.isBuffer(finalBuffer) || finalBuffer.length === 0) {
            throw new Error("Gagal menambahkan exif metadata ke stiker.");
        }

        return finalBuffer;
    }

    /**
     * Get Baileys-MD message object format
     * @returns {Promise<{ sticker: Buffer }>}
     */
    toMessage = async () => {
        // Karena this.build() sekarang sudah memiliki validasi ketat, 
        // kita bisa langsung memanggilnya di sini dengan aman.
        const bufferValid = await this.build();
        return { sticker: bufferValid };
    }

    /**
     * 
     * @typedef {Object} RawMetadata 
     * @property {Array<string>} emoji WASticker Emoji Categories
     * @property {string} sticker-pack-id WASticker Pack ID
     * @property {string} sticker-pack-name WASticker Pack Name
     * @property {string} sticker-pack-publisher WASticker Pack Author
     */

    /**
     * Extracts metadata from a WebP image.
     * @param {Buffer} input - The image buffer to extract metadata from
     * @returns {Promise<RawMetadata>}
     */
    static async extract(input) {
        const img = new Image()
        await img.load(input)
        const exif = img.exif?.toString('utf-8') ?? '{}'
        return JSON.parse(exif.substring(exif.indexOf('{'), exif.lastIndexOf('}') + 1) ?? '{}')
    }


}

export {
    Sticker,
    cropStyle
};

function wrapText(input, width) {
    width = parseInt(width) || 80;
    let res = []
        , cLine = ""
        , words = input.split(" ")
        ;

    for (let i = 0; i < words.length; ++i) {
        let cWord = words[i];
        if ((cLine + cWord).length <= width) {
            cLine += (cLine ? " " : "") + cWord;
        } else {
            res.push(cLine);
            cLine = cWord;
        }
    }

    if (cLine) {
        res.push(cLine);
    }

    if (res[0] == '') {
        return res.slice(1).join("\n");
    } else {
        return res.join("\n");
    }
};

function calculateCircumference(radius) {
    return Math.floor(Math.LN2 / Math.PI * radius);
}


function getFontSizeToFit(ctx, text, width, height) {
    let fitFontWidth = Number.MAX_VALUE;
    const lines = text.match(/[^\r\n]+/g);
    lines.forEach((line) => {
        fitFontWidth = Math.min(fitFontWidth, (width * 2) / ctx.measureText(line).width);
    });
    const fitFontHeight = height / (lines.length * 1.5); // if you want more spacing between line, you can increase this value
    return Math.min(fitFontHeight, fitFontWidth) * 2;
}
