import { Collection } from "./collections.js"

export class ResponseHandler {

    constructor(client) {

        this.client = client
        this.responses = new Collection()

    }

    on(response) {

        if (!response || !response.name) return

        this.responses.set(response.name, response)

    }

    async run(response, m, ctx) {

        if (!response && !m.body) return


        try {

            if (response.trigger && typeof response.trigger === "string") {

                if (!m.body.toLowerCase().includes(response.trigger.toLowerCase()))
                    return

            }

            if (response.pattern instanceof RegExp) {

                if (!response.pattern.test(m.body))
                    return

            }

            if (typeof response.filter === "function") {

                const pass = await response.filter(m, ctx)

                if (!pass) return

            }

            if (typeof response.execute === "function") {

                await response.execute(m, this.client, ctx)

            }

        } catch (err) {

            console.log(`[ERR RESPONSE] ${response.name}`, err)

        }

    }

}
