import { env } from '../config/env.js'
import { logger } from '../lib/logger.js'
import { HybridStore } from './hybrid-store.js'
import { JsonStore } from './json-store.js'
import { MongoStore } from './mongo-store.js'

export async function createStorage() {
  const jsonStore = new JsonStore({ dir: env.jsonDbDir })

  if (env.storageDriver === 'json') {
    await jsonStore.init()
    return jsonStore
  }

  const mongoStore = new MongoStore({ uri: env.mongodbUri, dbName: env.mongodbDbName })

  try {
    await mongoStore.init()
  } catch (error) {
    logger.error({ err: error }, 'Mongo init failed')
    if (env.storageDriver === 'mongo') throw error
    await jsonStore.init()
    logger.warn('Falling back to JSON store')
    return jsonStore
  }

  if (env.storageDriver === 'mongo') {
    return mongoStore
  }

  await jsonStore.init()
  return new HybridStore({ primary: mongoStore, mirror: jsonStore })
}
