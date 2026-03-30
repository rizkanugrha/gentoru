import { LRUCache } from 'lru-cache'

export const caches = {
  user: new LRUCache({ max: 1000, ttl: 5 * 60 * 1000 }),
  summary: new LRUCache({ max: 500, ttl: 2 * 60 * 1000 }),
  parse: new LRUCache({ max: 1000, ttl: 30 * 60 * 1000 }),
  media: new LRUCache({ max: 250, ttl: 30 * 60 * 1000 }),
  groupMetadata: new LRUCache({ max: 200, ttl: 30 * 60 * 1000 }),
}

export function invalidateUserCaches(userId) {
  caches.user.delete(userId)

  for (const key of caches.summary.keys()) {
    if (String(key).startsWith(`${userId}:`)) {
      caches.summary.delete(key)
    }
  }
}
