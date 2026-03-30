import http from 'node:http'
import { createStorage } from './storage/index.js'
import { logger } from './lib/logger.js'
import { env } from './config/env.js'
import { UserService } from './services/user-service.js'
import { ParserService } from './services/parser-service.js'
import { TransactionService } from './services/transaction-service.js'
import { BudgetService } from './services/budget-service.js'
import { GoalService } from './services/goal-service.js'
import { SummaryService } from './services/summary-service.js'
import { ExportService } from './services/export-service.js'
import { GeminiService } from './services/gemini-service.js'
import { MessageHandler } from './whatsapp/message-handler.js'
import { createSocket } from './whatsapp/socket.js'
import { SchedulerService } from './services/scheduler-service.js'

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, botName: env.botName, storage: env.storageDriver }))
      return
    }

    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(`${env.botName} aktif`)
  })

  server.listen(env.httpPort, () => {
    logger.info({ port: env.httpPort }, 'HTTP health server aktif')
  })
}

async function bootstrap() {
  const storage = await createStorage()
  const userService = new UserService(storage)
  const geminiService = new GeminiService()
  const parserService = new ParserService({ geminiService })
  const transactionService = new TransactionService({ storage, userService })
  const budgetService = new BudgetService({ userService, storage })
  const goalService = new GoalService({ userService })
  const summaryService = new SummaryService({ storage, userService, geminiService })
  const exportService = new ExportService({ storage })

  const handler = new MessageHandler({
    userService,
    parserService,
    transactionService,
    budgetService,
    goalService,
    summaryService,
    exportService,
  })

  const sock = await createSocket({ handler })

  const scheduler = new SchedulerService({
    sock,
    userService,
    summaryService,
  })
  scheduler.start()

  startHealthServer()

  logger.info({ geminiEnabled: geminiService.enabled, storage: env.storageDriver }, 'Bot berhasil dijalankan')
}

bootstrap().catch((error) => {
  logger.error({ err: error }, 'Bootstrap gagal')
  process.exit(1)
})
