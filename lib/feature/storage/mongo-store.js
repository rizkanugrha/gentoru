import { MongoClient } from 'mongodb'

function buildTxQuery(userId, filters = {}) {
  const query = { userId }
  if (filters.kind) query.kind = filters.kind
  if (filters.category) query.category = filters.category
  if (filters.search) {
    query.$or = [
      { description: { $regex: filters.search, $options: 'i' } },
      { category: { $regex: filters.search, $options: 'i' } },
      { tags: { $elemMatch: { $regex: filters.search, $options: 'i' } } },
      { 'meta.merchant': { $regex: filters.search, $options: 'i' } },
    ]
  }
  if (filters.from || filters.to) {
    query.occurredAt = {}
    if (filters.from) query.occurredAt.$gte = new Date(filters.from).toISOString()
    if (filters.to) query.occurredAt.$lte = new Date(filters.to).toISOString()
  }
  return query
}

export class MongoStore {
  constructor({ uri, dbName }) {
    this.uri = uri
    this.dbName = dbName
    this.client = new MongoClient(uri)
    this.db = null
    this.users = null
    this.transactions = null
  }

  async init() {
    await this.client.connect()
    this.db = this.client.db(this.dbName)
    this.users = this.db.collection('users')
    this.transactions = this.db.collection('transactions')
    await this.users.createIndex({ userId: 1 }, { unique: true })
    await this.transactions.createIndex({ userId: 1, occurredAt: -1 })
    await this.transactions.createIndex({ id: 1 }, { unique: true })
  }

  async close() {
    await this.client.close()
  }

  async getUser(userId) {
    return this.users.findOne({ userId }, { projection: { _id: 0 } })
  }

  async listUsers() {
    return this.users.find({}, { projection: { _id: 0 } }).toArray()
  }

  async upsertUser(user) {
    await this.users.updateOne({ userId: user.userId }, { $set: user }, { upsert: true })
    return user
  }

  async addTransaction(transaction) {
    await this.transactions.insertOne(transaction)
    return transaction
  }

  async getTransaction(userId, txId) {
    return this.transactions.findOne({ userId, id: txId }, { projection: { _id: 0 } })
  }

  async updateTransaction(userId, txId, patch) {
    const result = await this.transactions.findOneAndUpdate(
      { userId, id: txId },
      { $set: patch },
      { returnDocument: 'after', projection: { _id: 0 } },
    )
    return result || null
  }

  async deleteTransaction(userId, txId) {
    const result = await this.transactions.deleteOne({ userId, id: txId })
    return result.deletedCount > 0
  }

  async listTransactions(userId, filters = {}) {
    const query = buildTxQuery(userId, filters)
    const cursor = this.transactions.find(query, { projection: { _id: 0 } }).sort({ occurredAt: -1 })
    if (filters.limit) cursor.limit(filters.limit)
    return cursor.toArray()
  }
}
