import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import config from '../../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let providerInstance = null;

async function provider() {
  if (config.database.type === 'mongo' || config.database.type === 'mongodb') {
    class MongoDB {
      constructor(url, dbName) {
        this.url = url;
        this.dbName = dbName;
        this.collectionName = 'data';
        this.client = null;
        this.db = null;
      }

      async connect() {
        if (!this.client) {
          try {
            this.client = new MongoClient(this.url, {
              maxPoolSize: 1,
              minPoolSize: 1,
              maxIdleTimeMS: 30000,
              serverSelectionTimeoutMS: 5000,
              socketTimeoutMS: 45000,
              connectTimeoutMS: 10000
            });
            await this.client.connect();
            this.db = this.client.db(this.dbName);
            console.log('✓ Connected to MongoDB');
          } catch (error) {
            console.error('MongoDB connection error:', error);
            throw error;
          }
        }
      }

      async read() {
        await this.connect();
        try {
          const collection = this.db.collection(this.collectionName);
          const document = await collection.findOne({ _id: 'main' });
          if (!document) {
            const defaultData = { _id: 'main', data: {} };
            await collection.insertOne(defaultData);
            return defaultData.data;
          }
          return document.data || {};
        } catch (error) {
          console.error('Error reading data from MongoDB:', error);
          throw error;
        }
      }

      async write(data) {
        await this.connect();
        try {
          const collection = this.db.collection(this.collectionName);
          await collection.updateOne(
            { _id: 'main' },
            { $set: { data: data || {} } },
            { upsert: true }
          );
        } catch (error) {
          console.error('Error writing data to MongoDB:', error);
          throw error;
        }
      }

      async close() {
        if (this.client) {
          try {
            await this.client.close();
            this.client = null;
            this.db = null;
            console.log('✓ Disconnected from MongoDB');
          } catch (error) {
            console.error('Error disconnecting from MongoDB:', error);
            throw error;
          }
        }
      }
    }

    return { MongoDB };

  } else if (config.database.type === 'json') {
    class Local {
      data = {};
      file = path.join(process.cwd(), config.database.json.path || './database/db.json');

      read() {
        let data;
        if (fs.existsSync(this.file)) {
          try {
            data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
          } catch (err) {
            console.error(`Error parsing JSON from file: ${err}`);
            fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
            data = this.data;
          }
        } else {
          const dir = path.dirname(this.file);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
          data = this.data;
        }
        return data;
      }

      write(data) {
        this.data = data ? data : global.db;
        let dirname = path.dirname(this.file);
        if (!fs.existsSync(dirname)) {
          fs.mkdirSync(dirname, { recursive: true });
        }
        fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
        return this.file;
      }
    }

    return { Local };

  } else {
    throw new Error('Invalid database type specified in settings.');
  }
}

export async function getProvider() {
  if (!providerInstance) {
    providerInstance = await provider();
  }
  return providerInstance;
}
