import { env } from '../config/env.js'
import { formatRupiah, getLabelKategori } from '../constants/categories.js'
import { caches } from '../lib/cache.js'
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  formatDateTimeId,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '../lib/utils.js'

function resolveRange(period = 'month', refDate = new Date()) {
  if (period === 'day') {
    return { start: startOfDay(refDate), end: endOfDay(refDate), label: 'harian' }
  }
  if (period === 'week') {
    return { start: startOfWeek(refDate), end: endOfWeek(refDate), label: 'mingguan' }
  }
  return { start: startOfMonth(refDate), end: endOfMonth(refDate), label: 'bulanan' }
}

export class SummaryService {
  constructor({ storage, userService, geminiService = null }) {
    this.storage = storage
    this.userService = userService
    this.geminiService = geminiService
  }

  async summarize(userId, period = env.summaryDefaultPeriod, refDate = new Date()) {
    const cacheKey = `${userId}:${period}:${startOfDay(refDate).toISOString()}`
    const cached = caches.summary.get(cacheKey)
    if (cached) return cached

    const user = await this.userService.getUser(userId)
    const range = resolveRange(period, refDate)
    const transactions = await this.storage.listTransactions(userId, {
      from: range.start.toISOString(),
      to: range.end.toISOString(),
    })

    const income = transactions.filter((tx) => tx.kind === 'income').reduce((sum, tx) => sum + tx.amount, 0)
    const expense = transactions.filter((tx) => tx.kind === 'expense').reduce((sum, tx) => sum + tx.amount, 0)
    const savings = transactions
      .filter((tx) => tx.kind === 'saving_contribution')
      .reduce((sum, tx) => sum + tx.amount, 0)

    const expenseByCategory = {}
    for (const tx of transactions.filter((item) => item.kind === 'expense')) {
      expenseByCategory[tx.category] = (expenseByCategory[tx.category] || 0) + tx.amount
    }

    const topCategories = Object.entries(expenseByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => ({ category, amount }))

    const payload = {
      user,
      period,
      label: range.label,
      start: range.start,
      end: range.end,
      transactions,
      income,
      expense,
      savings,
      net: income - expense - savings,
      topCategories,
      balance: user?.balance.current || 0,
    }

    caches.summary.set(cacheKey, payload)
    return payload
  }

  formatSummary(summary, insightText = '') {
    const lines = [
      `📊 *Ringkasan ${summary.label}*`,
      `${formatDateTimeId(summary.start)} - ${formatDateTimeId(summary.end)}`,
      '',
      `Pemasukan: ${formatRupiah(summary.income)}`,
      `Pengeluaran: ${formatRupiah(summary.expense)}`,
      `Tabungan goal: ${formatRupiah(summary.savings)}`,
      `Net: ${formatRupiah(summary.net)}`,
      `Saldo saat ini: ${formatRupiah(summary.balance)}`,
      '',
      '*Top kategori pengeluaran:*',
    ]

    if (!summary.topCategories.length) {
      lines.push('- Belum ada pengeluaran di periode ini.')
    } else {
      for (const item of summary.topCategories) {
        lines.push(`- ${getLabelKategori('expense', item.category)}: ${formatRupiah(item.amount)}`)
      }
    }

    if (insightText) {
      lines.push('', '🧠 *Insight AI*', insightText)
    }

    return lines.join('\n')
  }

  async buildInsight(summary) {
    if (!this.geminiService || !env.enableGeminiInsight) return ''
    return this.geminiService.generateSummaryInsight(summary)
  }
}
