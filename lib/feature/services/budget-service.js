import { env } from '../config/env.js'
import { formatRupiah, getLabelKategori } from '../constants/categories.js'
import { addMonths, endOfMonth, startOfMonth } from '../lib/utils.js'

export class BudgetService {
  constructor({ userService, storage }) {
    this.userService = userService
    this.storage = storage
  }

  async setBudget(userId, scope, amount) {
    const user = await this.userService.getUser(userId)
    if (!user) return null

    if (scope === 'total') {
      user.budgets.totalMonthly = amount
    } else {
      user.budgets.categories[scope] = amount
    }

    await this.userService.saveUser(user)
    return user.budgets
  }

  async evaluateAlerts(userId, transaction) {
    if (transaction.kind !== 'expense') return []

    const user = await this.userService.getUser(userId)
    if (!user) return []

    const now = new Date(transaction.occurredAt)
    const currentTransactions = await this.storage.listTransactions(userId, {
      from: startOfMonth(now).toISOString(),
      to: endOfMonth(now).toISOString(),
    })

    const currentExpenses = currentTransactions.filter((item) => item.kind === 'expense')
    const totalSpent = currentExpenses.reduce((sum, item) => sum + (item.amount || 0), 0)
    const categorySpent = currentExpenses
      .filter((item) => item.category === transaction.category)
      .reduce((sum, item) => sum + (item.amount || 0), 0)

    const alerts = []
    const threshold = env.budgetAlertThreshold

    if (user.budgets.totalMonthly) {
      const ratio = totalSpent / user.budgets.totalMonthly
      if (ratio >= threshold) {
        alerts.push(
          `⚠️ Budget total bulan ini sudah terpakai ${Math.round(ratio * 100)}% (${formatRupiah(totalSpent)} dari ${formatRupiah(user.budgets.totalMonthly)}).`,
        )
      }
    }

    const categoryBudget = user.budgets.categories?.[transaction.category]
    if (categoryBudget) {
      const ratio = categorySpent / categoryBudget
      if (ratio >= threshold) {
        alerts.push(
          `⚠️ Budget ${getLabelKategori('expense', transaction.category)} sudah terpakai ${Math.round(ratio * 100)}% (${formatRupiah(categorySpent)} dari ${formatRupiah(categoryBudget)}).`,
        )
      }
    }

    const previousMonthStart = startOfMonth(addMonths(now, -1)).toISOString()
    const previousMonthEnd = endOfMonth(addMonths(now, -1)).toISOString()
    const previousTransactions = await this.storage.listTransactions(userId, {
      from: previousMonthStart,
      to: previousMonthEnd,
      category: transaction.category,
    })

    const previousExpense = previousTransactions
      .filter((item) => item.kind === 'expense')
      .reduce((sum, item) => sum + (item.amount || 0), 0)

    if (previousExpense > 0 && categorySpent > previousExpense * env.spendingSpikeMultiplier) {
      alerts.push(
        `📈 Pengeluaran ${getLabelKategori('expense', transaction.category)} bulan ini ${Math.round((categorySpent / previousExpense - 1) * 100)}% lebih tinggi dari bulan lalu.`,
      )
    }

    return alerts
  }
}
