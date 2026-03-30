import dotenv from 'dotenv'

dotenv.config()

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function toNumber(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

export const env = {
  botName: process.env.BOT_NAME || 'Baileys Finance Bot',
  pairingPhone: (process.env.PAIRING_PHONE || '').replace(/\D/g, ''),
  allowGroups: toBool(process.env.ALLOW_GROUPS, false),
  authDir: process.env.AUTH_DIR || './auth',

  storageDriver: process.env.STORAGE_DRIVER || 'json',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  mongodbDbName: process.env.MONGODB_DB_NAME || 'finance_bot',
  jsonDbDir: process.env.JSON_DB_DIR || './db/json',

  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  enableGeminiFallback: toBool(process.env.ENABLE_GEMINI_FALLBACK, true),
  enableGeminiInsight: toBool(process.env.ENABLE_GEMINI_INSIGHT, true),

  tz: process.env.TZ || 'Asia/Jakarta',
  enableAutoSummary: toBool(process.env.ENABLE_AUTO_SUMMARY, false),
  dailySummaryCron: process.env.DAILY_SUMMARY_CRON || '0 20 * * *',
  weeklySummaryCron: process.env.WEEKLY_SUMMARY_CRON || '0 8 * * 1',
  monthlySummaryCron: process.env.MONTHLY_SUMMARY_CRON || '0 8 1 * *',
  reminderCron: process.env.REMINDER_CRON || '0 9 * * *',

  defaultCurrency: process.env.DEFAULT_CURRENCY || 'IDR',
  summaryDefaultPeriod: process.env.SUMMARY_DEFAULT_PERIOD || 'month',
  budgetAlertThreshold: toNumber(process.env.BUDGET_ALERT_THRESHOLD, 0.8),
  spendingSpikeMultiplier: toNumber(process.env.SPENDING_SPIKE_MULTIPLIER, 1.2),
  mediaInlineMaxBytes: toNumber(process.env.MEDIA_INLINE_MAX_BYTES, 18_000_000),
  httpPort: toNumber(process.env.HTTP_PORT, 3000),
  logLevel: process.env.LOG_LEVEL || 'info',
}

export function isGeminiReady() {
  return Boolean(env.geminiApiKey)
}
