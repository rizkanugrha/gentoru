import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"

export class CommandLoader {

    constructor(dir, commandHandler, responseHandler) {
        this.dir = dir
        this.commandHandler = commandHandler
        this.responseHandler = responseHandler

        this.loadedFiles = new Map()
    }

    async load(file) {

        try {

            const fileUrl = pathToFileURL(file).href + `?v=${Date.now()}`
            const module = await import(fileUrl)

            if (!module?.default) {
                console.log(`[SKIP] ${file}`)
                return
            }

            const plugin = module.default
            const name = path.basename(file)

            const isResponse = name.endsWith("-res.js")

            const handler = isResponse
                ? this.responseHandler
                : this.commandHandler

            const logIcon = isResponse
                ? "🟡 Response"
                : "🟢 Command"

            /*
            =====================
            CLEAR OLD PLUGIN
            =====================
            */

            if (this.loadedFiles.has(file)) {

                const old = this.loadedFiles.get(file)

                if (old?.cmd) {

                    for (const c of old.cmd) {
                        this.commandHandler.commands.delete(c.toLowerCase())
                    }

                }

            }

            /*
            =====================
            EXECUTE PLUGIN
            =====================
            */

            let pluginData = null

            if (typeof plugin === "function") {

                pluginData = plugin(handler)
                console.log(`${logIcon} loaded (func) -> ${name}`)

            } else {

                handler.on(plugin)
                pluginData = plugin
                console.log(`${logIcon} loaded (obj) -> ${plugin.name || name}`)

            }

            this.loadedFiles.set(file, pluginData)

        } catch (err) {

            console.log(`❌ Error loading ${file}`)
            console.log(err)

        }

    }

    async scan(dir) {

        const files = fs.readdirSync(dir)

        for (const file of files) {

            const full = path.join(dir, file)
            const stat = fs.statSync(full)

            if (stat.isDirectory()) {
                await this.scan(full)
            } else if (file.endsWith(".js")) {
                await this.load(full)
            }

        }

    }

    /*
    =====================
    HOT RELOAD WATCHER
    =====================
    */

    watch() {

        fs.watch(this.dir, { recursive: true }, async (event, filename) => {

            if (!filename.endsWith(".js")) return

            const full = path.join(this.dir, filename)

            if (!fs.existsSync(full)) return

            console.log(`♻️ Reloading ${filename}`)

            await this.load(full)

        })

        console.log("🔥 Hot Reload Enabled")

    }

    async loadAll() {

        console.log("📦 Loading plugins...")

        await this.scan(this.dir)

        console.log("✅ All Plugins loaded")

        this.watch()

    }

}