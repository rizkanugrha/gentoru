import { readdirSync, statSync, existsSync, watch } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class CommandHandler {
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
            noPrefix = false,
            isAdmin = false,
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
            desc,
            noPrefix,
            isAdmin,
            isOwner,
            isGc,
            isPc,
            limit,
            isMt,
            handler
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
            if (isReload) {
                this.removeCommandsFromFile(filePath);
            }

            const beforeCommands = new Set(this.commands.keys());
            const fileUrl = pathToFileURL(filePath).href + `?t=${Date.now()}`;
            const module = await import(fileUrl);

            if (module.default && typeof module.default === 'function') {
                const originalOn = this.on.bind(this);
                const fileCommandNames = [];

                this.on = (options, handler) => {
                    originalOn(options, handler);
                    if (Array.isArray(options.cmd)) {
                        options.cmd.forEach(c => {
                            fileCommandNames.push(c.toLowerCase());
                        });
                    }
                };

                module.default(this);
                this.on = originalOn;

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

        const loadDir = async (dir) => {
            let files = [];
            try {
                files = readdirSync(dir);
            } catch (error) {
                console.error(`✗ Error reading dir ${dir}:`, error.message);
                return;
            }
            for (const file of files) {
                const filePath = join(dir, file);
                let stat;
                try {
                    stat = statSync(filePath);
                } catch (error) {
                    continue;
                }

                if (stat.isDirectory()) {
                    await loadDir(filePath);
                } else if (file.endsWith('.js')) {
                    await this.loadCommandFile(filePath, false);
                    this.loadedFiles.set(filePath, Date.now());
                    const relPath = relative(process.cwd(), filePath);
                    console.log(`✓ Loaded command: ${relPath}`);
                }
            }
        };

        await loadDir(cmdDir);
        console.log(`✓ Total commands loaded: ${this.commands.size}`);
    }

    getCommands() {
        return Array.from(this.commands.values());
    }
}

export default new CommandHandler();