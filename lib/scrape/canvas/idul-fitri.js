import { createCanvas, loadImage, registerFont } from "canvas";
import assets from "../../utils/assetManager.js";

export async function idulFitri1(untukText, dariText) {
    try {
        // Validasi: Pastikan objek assets dan fitri.data tersedia
        if (!assets || !assets.fitri || !assets.fitri.data) {
            throw new Error("Asset Manager 'fitri' belum terinisialisasi dengan benar.");
        }

        const fitriKeys = Object.keys(assets.fitri.data);

        if (fitriKeys.length === 0) {
            throw new Error("Folder src/assets/gambar/idul-fitri/ kosong atau tidak ditemukan.");
        }

        // Ambil key acak (misal: "1", "2", "3")
        const randomKey = fitriKeys[Math.floor(Math.random() * fitriKeys.length)];
        const imagePath = assets.fitri.get(randomKey);

        const image = await loadImage(imagePath);
        const { width, height } = image;

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");

        // Gambar Background
        ctx.drawImage(image, 0, 0, width, height);

        // Registrasi Font (Pastikan file font ada di folder)
        const fontPath = assets.font.get("MONTSERRAT-REGULAR");
        if (fontPath) {
            registerFont(fontPath, { family: "Montserrat" });
        }

        // ==========================================
        // PENGATURAN FONT & WARNA
        // ==========================================
        const fontSize = Math.floor(height * 0.03);

        ctx.font = `bold ${fontSize}px "Montserrat"`;
        ctx.fillStyle = "#1d1f1b";

        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        // ==========================================
        // KOORDINAT TEKS (GAS KE ATAS LAGI)
        // ==========================================

        // 1. Baris "Untuk :"
        // Y: Naik ke 63% (Mendekati area tengah gambar)
        const xUntuk = width * 0.39;
        const yUntuk = height * 0.728;
        ctx.fillText(untukText, xUntuk, yUntuk);

        // 2. Baris "Dari :"
        // Y: Naik ke 72%
        const xDari = width * 0.39;
        const yDari = height * 0.823;
        ctx.fillText(dariText, xDari, yDari);
        return canvas.toBuffer("image/jpeg")
    } catch (error) {
        // Error ini menangkap pesan "Cannot read properties of undefined" jika data kosong
        throw new Error("Failed to generate 'Ucapan Idul Fitri' image: " + error.message);
    }
}