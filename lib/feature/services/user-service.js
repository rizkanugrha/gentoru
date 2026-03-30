import { nowIso } from '../lib/utils.js'
import { caches } from '../lib/cache.js'

function buildDefaultUser({ userId, jid, pushName }) {
  return {
    userId,
    jid,
    pushName: pushName || '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    balance: {
      current: 0,
      currency: 'IDR',
      lastManualSetAt: null,
    },
    budgets: {
      totalMonthly: null,
      categories: {},
    },
    goals: [],
    recurringIncomes: [],
    debts: [],
    preferences: {
      autoSummary: {
        daily: false,
        weekly: false,
        monthly: false,
      },
      reminderSettings: {
        daily: false,
        weekly: false,
        monthly: false,
      },
    },
    stats: {
      lastInteractionAt: nowIso(),
    },
  }
}

export class UserService {
  constructor(storage) {
    this.storage = storage
  }

  async getUser(userId) {
    const cached = caches.user.get(userId)
    if (cached) return cached
    const user = await this.storage.getUser(userId)
    if (user) caches.user.set(userId, user)
    return user
  }

  async ensureUser({ userId, jid, pushName }) {
    const existing = await this.getUser(userId)
    if (existing) {
      const updated = {
        ...existing,
        jid: jid || existing.jid,
        pushName: pushName || existing.pushName,
        updatedAt: nowIso(),
        stats: {
          ...existing.stats,
          lastInteractionAt: nowIso(),
        },
      }
      await this.saveUser(updated)
      return updated
    }

    const user = buildDefaultUser({ userId, jid, pushName })
    await this.saveUser(user)
    return user
  }

  async saveUser(user) {
    user.updatedAt = nowIso()
    await this.storage.upsertUser(user)
    caches.user.set(user.userId, user)
    return user
  }

  async updateUser(userId, updater) {
    const current = await this.getUser(userId)
    if (!current) return null
    const next = typeof updater === 'function' ? updater(structuredClone(current)) : { ...current, ...updater }
    return this.saveUser(next)
  }

  async setReminderPreference(userId, reminderType, enabled) {
    const allowed = new Set(['daily', 'weekly', 'monthly'])
    if (!allowed.has(reminderType)) return null

    return this.updateUser(userId, (current) => {
      current.preferences = current.preferences || {}
      current.preferences.reminderSettings = {
        daily: false,
        weekly: false,
        monthly: false,
        ...(current.preferences.reminderSettings || {}),
        [reminderType]: Boolean(enabled),
      }
      return current
    })
  }

  async getReminderPreference(userId) {
    const user = await this.getUser(userId)
    return user?.preferences?.reminderSettings || {
      daily: false,
      weekly: false,
      monthly: false,
    }
  }
}
