import { logger } from '../lib/logger.js'

export class HybridStore {
  constructor({ primary, mirror }) {
    this.primary = primary
    this.mirror = mirror
  }

  async init() {
    await Promise.all([this.primary.init(), this.mirror.init()])
  }

  async getUser(userId) {
    const user = await this.primary.getUser(userId)
    if (user) return user
    return this.mirror.getUser(userId)
  }

  async listUsers() {
    const users = await this.primary.listUsers()
    if (users.length) return users
    return this.mirror.listUsers()
  }

  async upsertUser(user) {
    const results = await Promise.allSettled([this.primary.upsertUser(user), this.mirror.upsertUser(user)])
    for (const result of results) {
      if (result.status === 'rejected') logger.warn({ err: result.reason }, 'Hybrid store mirror write failed')
    }
    return user
  }

  async addTransaction(transaction) {
    const results = await Promise.allSettled([
      this.primary.addTransaction(transaction),
      this.mirror.addTransaction(transaction),
    ])
    for (const result of results) {
      if (result.status === 'rejected') logger.warn({ err: result.reason }, 'Hybrid store mirror write failed')
    }
    return transaction
  }

  async getTransaction(userId, txId) {
    const tx = await this.primary.getTransaction(userId, txId)
    if (tx) return tx
    return this.mirror.getTransaction(userId, txId)
  }

  async updateTransaction(userId, txId, patch) {
    const results = await Promise.allSettled([
      this.primary.updateTransaction(userId, txId, patch),
      this.mirror.updateTransaction(userId, txId, patch),
    ])
    for (const result of results) {
      if (result.status === 'rejected') logger.warn({ err: result.reason }, 'Hybrid store mirror write failed')
    }
    return results[0].status === 'fulfilled' ? results[0].value : null
  }

  async deleteTransaction(userId, txId) {
    const results = await Promise.allSettled([
      this.primary.deleteTransaction(userId, txId),
      this.mirror.deleteTransaction(userId, txId),
    ])
    for (const result of results) {
      if (result.status === 'rejected') logger.warn({ err: result.reason }, 'Hybrid store mirror write failed')
    }
    return results[0].status === 'fulfilled' ? results[0].value : false
  }

  async listTransactions(userId, filters = {}) {
    const transactions = await this.primary.listTransactions(userId, filters)
    if (transactions.length) return transactions
    return this.mirror.listTransactions(userId, filters)
  }
}
