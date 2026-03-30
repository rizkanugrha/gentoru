import { formatRupiah, getLabelKategori } from '../constants/categories.js'
import { invalidateUserCaches } from '../lib/cache.js'
import { createId, nowIso } from '../lib/utils.js'

function normalizeTransactionKind(kind) {
  const allowed = [
    'expense',
    'income',
    'balance_set',
    'balance_adjustment',
    'saving_contribution',
    'debt',
    'receivable',
  ]
  return allowed.includes(kind) ? kind : 'expense'
}

function applyBalanceChange(balance, tx) {
  switch (tx.kind) {
    case 'balance_set':
      return tx.amount
    case 'income':
      return balance + tx.amount
    case 'expense':
      return balance - tx.amount
    case 'saving_contribution':
      return balance - tx.amount
    case 'balance_adjustment':
      return balance + (tx.delta || 0)
    case 'debt':
      return balance + tx.amount
    case 'receivable':
      return balance - tx.amount
    default:
      return balance
  }
}

export class TransactionService {
  constructor({ storage, userService }) {
    this.storage = storage
    this.userService = userService
  }

  async recordTransaction(userId, input) {
    const user = await this.userService.getUser(userId)
    if (!user) return null

    const kind = normalizeTransactionKind(input.kind)
    const amount = Math.abs(Number(input.amount || 0))
    const tx = {
      id: createId('tx'),
      userId,
      kind,
      amount,
      delta: Number.isFinite(input.delta) ? input.delta : null,
      category: input.category || (kind === 'income' ? 'lainlain' : 'lainlain'),
      description: input.description || '',
      tags: Array.isArray(input.tags) ? input.tags : [],
      source: input.source || 'text',
      occurredAt: input.occurredAt || nowIso(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      meta: input.meta || {},
    }

    if (kind === 'balance_set') {
      tx.meta.previousBalance = user.balance.current
      tx.meta.newBalance = amount
    }

    const afterBalance = applyBalanceChange(user.balance.current, tx)
    tx.meta.afterBalance = afterBalance

    await this.storage.addTransaction(tx)
    user.balance.current = afterBalance
    if (kind === 'balance_set') user.balance.lastManualSetAt = nowIso()
    await this.userService.saveUser(user)
    invalidateUserCaches(userId)
    return tx
  }

  async setBalance(userId, amount, description = 'Set saldo manual', meta = {}) {
    return this.recordTransaction(userId, {
      kind: 'balance_set',
      amount,
      category: 'lainlain',
      description,
      source: meta.source || 'command',
      meta,
    })
  }

  async adjustBalance(userId, delta, description = 'Penyesuaian saldo', meta = {}) {
    return this.recordTransaction(userId, {
      kind: 'balance_adjustment',
      amount: Math.abs(delta),
      delta,
      category: 'lainlain',
      description,
      source: meta.source || 'command',
      meta,
    })
  }

  async getCurrentBalance(userId) {
    const user = await this.userService.getUser(userId)
    return user?.balance.current || 0
  }

  async getHistory(userId, filters = {}) {
    return this.storage.listTransactions(userId, filters)
  }

  async deleteTransaction(userId, txId) {
    const ok = await this.storage.deleteTransaction(userId, txId)
    if (ok) await this.recalculateBalance(userId)
    return ok
  }

  async editTransaction(userId, txId, patch) {
    const sanitized = { ...patch, updatedAt: nowIso() }
    if (patch.amount !== undefined) sanitized.amount = Math.abs(Number(patch.amount || 0))
    if (patch.delta !== undefined) sanitized.delta = Number(patch.delta || 0)

    const updated = await this.storage.updateTransaction(userId, txId, sanitized)
    if (updated) await this.recalculateBalance(userId)
    return updated
  }

  async recalculateBalance(userId) {
    const user = await this.userService.getUser(userId)
    if (!user) return 0

    const all = await this.storage.listTransactions(userId)
    const sorted = [...all].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))

    let balance = 0
    for (const tx of sorted) {
      balance = applyBalanceChange(balance, tx)
    }

    user.balance.current = balance
    await this.userService.saveUser(user)
    invalidateUserCaches(userId)
    return balance
  }

  formatTransaction(tx) {
    const kindLabelMap = {
      expense: 'Pengeluaran',
      income: 'Pemasukan',
      balance_set: 'Set Saldo',
      balance_adjustment: 'Penyesuaian Saldo',
      saving_contribution: 'Tabungan Goal',
      debt: 'Hutang',
      receivable: 'Piutang',
    }

    return [
      `✅ *${kindLabelMap[tx.kind] || tx.kind} tercatat*`,
      `ID: ${tx.id}`,
      `Kategori: ${getLabelKategori(tx.kind === 'income' ? 'income' : 'expense', tx.category)}`,
      `Jumlah: ${formatRupiah(tx.amount)}`,
      tx.description ? `Catatan: ${tx.description}` : null,
    ]
      .filter(Boolean)
      .join('\n')
  }
}
