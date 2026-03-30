import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

function matchesTransactionFilters(item, filters = {}) {
  if (filters.userId && item.userId !== filters.userId) return false
  if (filters.kind && item.kind !== filters.kind) return false
  if (filters.category && item.category !== filters.category) return false
  if (filters.search) {
    const haystack = `${item.description || ''} ${item.category || ''} ${(item.tags || []).join(' ')} ${(item.meta?.merchant || '')}`.toLowerCase()
    if (!haystack.includes(String(filters.search).toLowerCase())) return false
  }
  if (filters.from && new Date(item.occurredAt) < new Date(filters.from)) return false
  if (filters.to && new Date(item.occurredAt) > new Date(filters.to)) return false
  return true
}

export class JsonStore {
  constructor({ dir }) {
    this.dir = dir
    this.files = {
      users: path.join(dir, 'users.json'),
      transactions: path.join(dir, 'transactions.json'),
    }
    this.writeQueue = Promise.resolve()
  }

  async init() {
    await mkdir(this.dir, { recursive: true })
    await this.ensureFile('users')
    await this.ensureFile('transactions')
  }

  async ensureFile(name) {
    try {
      await readFile(this.files[name], 'utf8')
    } catch {
      await writeFile(this.files[name], '[]', 'utf8')
    }
  }

  async withWriteLock(task) {
    this.writeQueue = this.writeQueue.then(task, task)
    return this.writeQueue
  }

  async readCollection(name) {
    await this.ensureFile(name)
    const raw = await readFile(this.files[name], 'utf8')
    return JSON.parse(raw || '[]')
  }

  async writeCollection(name, payload) {
    const tempPath = `${this.files[name]}.tmp`
    await writeFile(tempPath, JSON.stringify(payload, null, 2), 'utf8')
    await rename(tempPath, this.files[name])
  }

  async getUser(userId) {
    const users = await this.readCollection('users')
    return users.find((user) => user.userId === userId) || null
  }

  async listUsers() {
    return this.readCollection('users')
  }

  async upsertUser(user) {
    return this.withWriteLock(async () => {
      const users = await this.readCollection('users')
      const index = users.findIndex((item) => item.userId === user.userId)
      if (index >= 0) users[index] = user
      else users.push(user)
      await this.writeCollection('users', users)
      return user
    })
  }

  async addTransaction(transaction) {
    return this.withWriteLock(async () => {
      const transactions = await this.readCollection('transactions')
      transactions.push(transaction)
      await this.writeCollection('transactions', transactions)
      return transaction
    })
  }

  async getTransaction(userId, txId) {
    const transactions = await this.readCollection('transactions')
    return transactions.find((item) => item.userId === userId && item.id === txId) || null
  }

  async updateTransaction(userId, txId, patch) {
    return this.withWriteLock(async () => {
      const transactions = await this.readCollection('transactions')
      const index = transactions.findIndex((item) => item.userId === userId && item.id === txId)
      if (index < 0) return null
      transactions[index] = { ...transactions[index], ...patch }
      await this.writeCollection('transactions', transactions)
      return transactions[index]
    })
  }

  async deleteTransaction(userId, txId) {
    return this.withWriteLock(async () => {
      const transactions = await this.readCollection('transactions')
      const before = transactions.length
      const filtered = transactions.filter((item) => !(item.userId === userId && item.id === txId))
      if (filtered.length === before) return false
      await this.writeCollection('transactions', filtered)
      return true
    })
  }

  async listTransactions(userId, filters = {}) {
    const transactions = await this.readCollection('transactions')
    const result = transactions
      .filter((item) => matchesTransactionFilters(item, { ...filters, userId }))
      .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
    return filters.limit ? result.slice(0, filters.limit) : result
  }
}
