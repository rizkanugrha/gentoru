import { getProvider } from './db/provider.js';
import config from '../config.js';

class Database {
  constructor() {
    this.type = config.database.type;
    this.mydb = null;
    this.db = null;
    this.writeTimer = null;
  }

  async connect() {
    const dbclass = await getProvider();
    
    if (this.type === 'mongo' || this.type === 'mongodb') {
      this.mydb = new dbclass.MongoDB(config.database.mongodb.uri, config.database.mongodb.dbName);
    } else {
      this.mydb = new dbclass.Local();
    }
    
    this.db = await this.mydb.read();
    
    if (!this.db || Object.keys(this.db).length === 0) {
      this.db = {
        users: {},
        groups: {},
        setting: {},
        contacts: {},
        groupMetadata: {},
        stats: {}
      };
      await this.mydb.write(this.db);
      console.log('✓ Database initialized!');
    } else {
      if (!this.db.setting) {
        this.db.setting = {};
      }
      if (!Array.isArray(this.db.setting.owner)) {
        this.db.setting.owner = Array.isArray(config.bot.owner) ? config.bot.owner : [config.bot.owner];
      }
      console.log('✓ Database loaded.');
    }
    
    global.db = this.db;
    return this.db;
  }

  async disconnect() {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    
    if (this.mydb && this.mydb.close) {
      await this.mydb.close();
    }
  }

  async write() {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    
    this.writeTimer = setTimeout(async () => {
      try {
        await this.mydb.write(this.db);
      } catch (error) {
        console.error('Error writing database:', error);
      } finally {
        this.writeTimer = null;
      }
    }, 500);
  }

  get(collection, key, defaultValue = null) {
    if (!this.db[collection]) {
      this.db[collection] = {};
    }
    return this.db[collection][key] !== undefined ? this.db[collection][key] : defaultValue;
  }

  set(collection, key, value) {
    if (!this.db[collection]) {
      this.db[collection] = {};
    }
    this.db[collection][key] = value;
    this.write();
    return value;
  }

  delete(collection, key) {
    if (this.db[collection] && this.db[collection][key] !== undefined) {
      delete this.db[collection][key];
      this.write();
      return true;
    }
    return false;
  }

  getAll(collection) {
    if (!this.db[collection]) {
      return [];
    }
    return Object.entries(this.db[collection]).map(([key, value]) => ({ key, value }));
  }
}

export default new Database();

