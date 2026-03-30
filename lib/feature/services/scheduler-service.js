import cron from 'node-cron'
import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'

export class SchedulerService {
  constructor({ sock, userService, summaryService }) {
    this.sock = sock
    this.userService = userService
    this.summaryService = summaryService
    this.jobs = []
  }

  start() {
    if (!env.enableAutoSummary) {
      logger.info('Scheduler reminder otomatis nonaktif via ENABLE_AUTO_SUMMARY=false')
      return
    }

    this.jobs.push(
      cron.schedule(env.dailySummaryCron, () => this.broadcastSummary('day', 'daily'), { timezone: env.tz }),
    )
    this.jobs.push(
      cron.schedule(env.weeklySummaryCron, () => this.broadcastSummary('week', 'weekly'), { timezone: env.tz }),
    )
    this.jobs.push(
      cron.schedule(env.monthlySummaryCron, () => this.broadcastSummary('month', 'monthly'), { timezone: env.tz }),
    )

    logger.info('Scheduler reminder otomatis aktif')
  }

  async broadcastSummary(period, label) {
    try {
      const users = await this.userService.storage.listUsers()
      for (const user of users) {
        if (!user?.jid) continue
        const reminders = user?.preferences?.reminderSettings || user?.preferences?.autoSummary || {}
        if (!reminders?.[label]) continue
        const summary = await this.summaryService.summarize(user.userId, period)
        const insight = await this.summaryService.buildInsight(summary)
        await this.sock.sendMessage(user.jid, {
          text: `⏰ Laporan ${label} otomatis\n\n${this.summaryService.formatSummary(summary, insight)}`,
        })
      }
    } catch (error) {
      logger.error({ err: error }, 'Broadcast summary failed')
    }
  }

  stop() {
    for (const job of this.jobs) {
      job.stop()
    }
  }
}
