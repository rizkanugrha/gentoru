import { promises as fs, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Polyfill for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AssetManager {
    constructor(dir) {
        this.dir = dir;
        this.loaded = false;
        this.data = {};
    }

    async load() {
        const files = await fs.readdir(this.dir);

        for (const file of files) {
            const name = (file.split(".").shift() ?? file).toUpperCase();
            this.data[name] = `${this.dir}/${file}`;
        }

        this.loaded = true;
    }

    loadSync() {
        const files = readdirSync(this.dir);

        for (const file of files) {
            const name = (file.split(".").shift() ?? file).toUpperCase();
            this.data[name] = `${this.dir}/${file}`;
        }

        this.loaded = true;
    }

    clear() {
        this.data = {};
        this.loaded = false;
    }

    get(name) {
        return this.data[name];
    }

    set(name, data) {
        return this.data[name.toUpperCase()] = data;
    }

    get size() {
        return Object.keys(this.data).length;
    }
}

export const font = new AssetManager(path.join(process.cwd(), `/src/assets/font/`));
export const image = new AssetManager(path.join(process.cwd(), `/src/assets/gambar/`));
font.loadSync();
image.loadSync();
export const utils = {
    AssetManager
};

// Optional: Default export to match the exact shape of your previous `export =`
export default {
    font,
    image,
    utils
};