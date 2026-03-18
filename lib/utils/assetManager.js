import { promises as fs, readdirSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AssetManager {
    constructor(dir) {
        this.dir = dir;
        this.loaded = false;
        this.data = {};
    }

    loadSync() {
        // Tambahkan pengecekan apakah folder ada
        if (!existsSync(this.dir)) {
            console.error(`[AssetManager] Warning: Directory not found: ${this.dir}`);
            return;
        }

        const files = readdirSync(this.dir);
        for (const file of files) {
            // Mengambil nama file sebagai key (contoh: 1.png -> "1")
            const name = (file.split(".").shift() ?? file).toUpperCase();
            this.data[name] = path.join(this.dir, file);
        }
        this.loaded = true;
    }

    get(name) {
        return this.data[name.toString().toUpperCase()];
    }
}

// Gunakan process.cwd() untuk memastikan path absolut dari root project
export const font = new AssetManager(path.join(process.cwd(), "src/assets/font"));
export const image = new AssetManager(path.join(process.cwd(), "src/assets/gambar"));
export const fitri = new AssetManager(path.join(process.cwd(), "src/assets/gambar/idul-fitri"));

// Jalankan loading secara sinkron saat module di-import
font.loadSync();
image.loadSync();
fitri.loadSync();

export default { font, image, fitri };