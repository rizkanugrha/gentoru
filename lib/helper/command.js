import { readdirSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const readFilesRecursively = (dir) => {
    let results = [];
    try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                results = results.concat(readFilesRecursively(fullPath));
            }
            // Filter: Hanya .js atau .cjs, abaikan jika file .bak
            else if ((entry.name.endsWith('.js') || entry.name.endsWith('.cjs')) && !entry.name.endsWith('.bak')) {
                results.push(fullPath);
            }
        }
    } catch (err) {
        console.error(`✗ Error reading directory ${dir}:`, err.message);
    }
    return results;
};

export class CommandHandler {
    constructor() {
        this.commands = new Map();
        this.prefix = '.';
        this.loadedFiles = new Map();
        this.fileCommands = new Map();
    }

    setPrefix(prefix) {
        this.prefix = prefix;
    }

    on(options, handler) {
        const {
            cmd,
            desc = 'none',
            usage = '',
            noPrefix = false,
            isAdmin = false,
            isBotAdmin = false,
            isOwner = false,
            isGc = false,
            isPc = false,
            limit = 0,
            isMt = false
        } = options;

        if (!Array.isArray(cmd)) {
            throw new Error('cmd must be an array');
        }

        const commandData = {
            cmd: cmd.map(c => c.toLowerCase()),
            desc, usage, noPrefix, isAdmin, isBotAdmin, isOwner, isGc, isPc, limit, isMt, handler
        };

        cmd.forEach(c => {
            this.commands.set(c.toLowerCase(), commandData);
        });
    }

    removeCommandsFromFile(filePath) {
        const commands = this.fileCommands.get(filePath) || [];
        commands.forEach(cmdName => {
            this.commands.delete(cmdName);
        });
        this.fileCommands.delete(filePath);
    }

    async loadCommandFile(filePath, isReload = false) {
        try {
            if (isReload) this.removeCommandsFromFile(filePath);

            const fileUrl = pathToFileURL(filePath).href + `?t=${Date.now()}`;
            const module = await import(fileUrl);

            if (module.default && typeof module.default === 'function') {
                const fileCommandNames = [];

                // PERBAIKAN: Buat Wrapper Object agar aman jika terjadi error (tidak mengubah this secara global)
                const wrappedCommander = {
                    on: (options, handler) => {
                        this.on(options, handler); // Panggil ke fungsi aslinya
                        if (Array.isArray(options.cmd)) {
                            options.cmd.forEach(c => fileCommandNames.push(c.toLowerCase()));
                        }
                    },
                    prefix: this.prefix,
                    commands: this.commands
                };

                // Lempar wrapper ke dalam file command, kita gunakan await jika export module bersifat async
                await module.default(wrappedCommander);

                this.fileCommands.set(filePath, fileCommandNames);
            }
            return true;
        } catch (error) {
            console.error(`✗ Error loading ${filePath}:`, error.message);
            return false;
        }
    }

    async loadCommands() {
        const cmdDir = join(process.cwd(), 'cmd');
        if (!existsSync(cmdDir)) {
            console.log('⚠ cmd directory not found');
            return;
        }

        this.loadedFiles = new Map();

        const files = readFilesRecursively(cmdDir);
        let loadedFilesCount = 0;

        for (const file of files) {
            try {
                const success = await this.loadCommandFile(file, false);
                if (success) {
                    this.loadedFiles.set(file, Date.now());
                    const relPath = relative(process.cwd(), file);
                    console.log(`✓ Loaded command: ${relPath}`);
                    loadedFilesCount++;
                }
            } catch (err) {
                console.error(`✗ Failed to load ${file}:`, err.message);
            }
        }

        console.log(`\n🎯 Total Files Loaded: ${loadedFilesCount}`);
        console.log(`🎯 Total Commands Registered: ${this.commands.size}`);
    }

    getCommands() {
        return Array.from(this.commands.values());
    }
}