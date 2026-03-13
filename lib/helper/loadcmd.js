/**
 * Author  : Rizka Nugraha
 * Name    : violet-rzk
 * Version : 2.8.24
 * Update  : 20 September 2025
 */

import { join, basename } from "path";
import { readdirSync, watchFile } from "fs";
import { pathToFileURL } from "url";
import Color from "./color.js";
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
        console.log(Color.yellow(`[COMMAND] Reloaded: ${modulePath}`));
    });
}

export async function loadCommands() {
    const cmdPath = join(process.cwd(), 'src', 'commands');
    const files = readFilesRecursively(cmdPath);

    let loadedCmd = 0;
    let loadedEv = 0;

    for (const file of files) {
        try {
            const fileUrl = pathToFileURL(file).href;
            const mod = await import(fileUrl + `?update=${Date.now()}`); // bypass cache
            const cmd = mod?.default || mod;
            const name = (cmd?.name || basename(file, '.js')).toLowerCase();

            if (!name) continue;

            if (name.endsWith('ev')) {
                events.set(name, cmd);
                console.log('⚡ Event', Color.yellowBright(name), 'loaded');
                loadedEv++;
            } else {
                commands.set(name, cmd);
                console.log('✅ Command', Color.blueBright(name), 'loaded');
                loadedCmd++;
            }

            nocache(require.resolve(file), (modPath) => {
                console.clear();
                console.log(Color.cyan(`🔁 ${name} reloaded on ${modPath}`));

                // Reload module on file change
                delete require.cache[require.resolve(modPath)];
                import(pathToFileURL(modPath).href + `?update=${Date.now()}`)
                    .then(updatedMod => {
                        const updated = updatedMod?.default || updatedMod;
                        const isEvent = name.endsWith('ev');
                        if (isEvent) {
                            events.set(name, updated);
                        } else {
                            commands.set(name, updated);
                        }
                        console.log(Color.green(`✅ ${name} updated successfully`));
                    })
                    .catch(err => {
                        console.error(Color.red(`❌ Failed to reload ${name}: ${err.message}`));
                    });
            });

        } catch (err) {
            console.error(`❌ Failed to load ${file}:`, err.message);
        }
    }

    console.log(`\n🎯 Total Commands: ${loadedCmd}, Events: ${loadedEv}`);
    return { commands: loadedCmd, events: loadedEv };
}
