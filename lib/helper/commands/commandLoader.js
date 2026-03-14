import fs from "fs"
import path from "path"
import { pathToFileURL } from "url"

export class CommandLoader {

    constructor(dir, commandHandler, responseHandler) {
        this.dir = dir
        this.commandHandler = commandHandler
        this.responseHandler = responseHandler
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

            /*
            =====================
            RESPONSE FILE
            =====================
            */

            if (name.endsWith("-res.js")) {

                this.responseHandler.on(plugin)

                console.log(`🟡 Response loaded -> ${plugin.name}`)

                return
            }

            /*
            =====================
            COMMAND FILE
            =====================
            */

            this.commandHandler.on(plugin)

            console.log(`🟢 Command loaded -> ${plugin.name}`)

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

    async loadAll() {

        console.log("📦 Loading plugins...")

        await this.scan(this.dir)

        console.log("✅ Plugin loaded")

    }

}
