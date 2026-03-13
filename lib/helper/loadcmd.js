/**
 * Author  : Rizka Nugraha
 * Name    : violet-rzk
 * Version : 2.8.24
 * Update  : 20 September 2025
 */

import { join, basename } from "path";
import { readdirSync, watchFile } from "fs";
import { pathToFileURL } from "url";
import Color from '../utils/color.js'; // Pastikan path utils warna ini benar
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export const commands = new Map();
export const events = new Map();

const readFilesRecursively = (dir) => {
    let results = [];

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
            results = results.concat(readFilesRecursively(fullPath));
        } else if (entry.name.endsWith('.js') && !entry.name.startsWith('.')) {
            results.push(fullPath);
        }
    }

    return results;
};

function nocache(modulePath, callback = () => { }) {
    watchFile(modulePath, () => {
        delete require.cache[modulePath];
        callback(modulePath);
    });
}

export async function loadCommands() {
    const cmdPath = join(process.cwd(), 'cmd');
    const files = readFilesRecursively(cmdPath);

    let loadedCmd = 0;
    let loadedEv = 0;

    for (const file of files) {
        try {
            const fileUrl = pathToFileURL(file).href;
            const mod = await import(fileUrl + `?update=${Date.now()}`); // bypass cache
            const initFn = mod?.default || mod;
            const fileName = basename(file, '.js').toLowerCase();
            const isEvent = fileName.endsWith('ev');

            // 1. INI ADALAH SISTEM COMMANDER YANG BARU
            const commander = {
                on: (config) => {
                    if (isEvent) {
                        events.set(fileName, config);
                        console.log('⚡ Event', Color.yellowBright(fileName), 'loaded');
                        loadedEv++;
                    } else {
                        // Memisahkan command utama dan alias
                        const cmds = Array.isArray(config.cmd) ? config.cmd : [config.cmd || fileName];
                        config.name = cmds[0];
                        config.aliases = cmds.slice(1);

                        commands.set(config.name, config);
                        console.log('✅ Command', Color.blueBright(config.name), 'loaded');
                        loadedCmd++;
                    }
                }
            };

            // 2. JALANKAN FUNGSI DARI FILE COMMAND/EVENT
            if (typeof initFn === 'function') {
                initFn(commander);
            } else {
                console.log(Color.red(`⚠️ Format ${fileName} salah. Harus berupa export default function(commander)`));
                continue;
            }

            // 3. AUTO RELOAD SAAT FILE DISAVE
            nocache(require.resolve(file), async (modPath) => {
                console.log(Color.yellow(`[COMMAND] Reloaded: ${fileName}`));
                try {
                    const updatedMod = await import(pathToFileURL(modPath).href + `?update=${Date.now()}`);
                    const updatedFn = updatedMod?.default || updatedMod;
                    if (typeof updatedFn === 'function') {
                        updatedFn(commander); // Daftarkan ulang command yang diupdate
                    }
                } catch (e) {
                    console.error(`Gagal memuat ulang ${fileName}:`, e.message);
                }
            });

        } catch (err) {
            console.error(`❌ Failed to load ${file}:`, err.message);
        }
    }

    console.log(`\n🎯 Total Commands: ${loadedCmd}, Events: ${loadedEv}`);
    return { commands: loadedCmd, events: loadedEv };
}