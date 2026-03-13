import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser
} from 'baileys';
import pino from 'pino';
import { existsSync, mkdirSync, watch } from 'fs';
import { join, relative } from 'path';
import { pathToFileURL } from 'url';
import config from './config.js';
import db from './lib/database.js';
import schema from './lib/db/schema.js';

// Mengimpor class dari folder helper

import { CommandHandler } from './lib/helper/command.js';
//import { MessageSerializer } from './lib/helper/serialize.js';
import serialize from './lib/helper/serializer.js'
import { MessageProcessor } from './lib/helper/process.js';
import { SocketExtender } from './lib/helper/socket.js';
import {
  formatLog,
  formatContactLog,
  getBotNumber,
  hasSession,
  parsePhoneNumber
} from './lib/helper/utils.js';
import { sendTelegram } from './lib/utils/function.js';

// Inisialisasi instance dari masing-masing class helper
const commandHandler = new CommandHandler();
//const messageSerializer = new MessageSerializer();
const messageProcessor = new MessageProcessor(commandHandler);

const logger = pino({
  level: 'error',
  transport: undefined
});

const log = {
  info: (msg) => console.log(msg),
  error: (msg) => console.error(msg),
  success: (msg) => console.log(`✓ ${msg}`)
};

if (!existsSync(config.bot.sessionPath)) {
  mkdirSync(config.bot.sessionPath, { recursive: true });
}

global.sock = null;
let botNumber = null;
let isReconnecting = false;
let isWaitingForPairing = false;
let commandsLoaded = false;
let hotReloadStarted = false;
const hotReloadWatchers = [];
let isSockReady = false;
const pendingMessages = [];
let flushingPending = false;
const activeTimers = new Set();
const MAX_PENDING_MESSAGES = 200;
const PENDING_MESSAGE_TTL = 3 * 60 * 1000;

async function startBot() {
  if (isReconnecting) {
    return;
  }

  try {
    isSockReady = false;
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        await sock.end();
      } catch (e) { }
      sock = null;
    }

    if (pendingMessages.length > 0) {
      const now = Date.now();
      for (let i = pendingMessages.length - 1; i >= 0; i--) {
        if (now - pendingMessages[i].at > PENDING_MESSAGE_TTL) {
          pendingMessages.splice(i, 1);
        }
      }
    }

    await db.connect();

    if (!botNumber) {
      botNumber = await getBotNumber(log);
    }

    if (!commandsLoaded) {
      await loadCommands();
      commandsLoaded = true;
    }

    const { state, saveCreds } = await useMultiFileAuthState(config.bot.sessionPath);
    const sessionExists = hasSession(config.bot.sessionPath) && state.creds?.registered;

    const { version } = await fetchLatestBaileysVersion();
    const versionStr = Array.isArray(version) ? version.join('.') : version;
    log.info(`Using Baileys version: ${versionStr}`);

    sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      mobile: false,
      printQRInTerminal: false,
      browser: Browsers.macOS('Chrome'),
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      retryRequestDelayMs: 10,
      transactionOpts: {
        maxCommitRetries: 5,
        delayBetweenTriesMs: 10
      },
      maxMsgRetryCount: 10,
      appStateMacVerification: {
        patch: true,
        snapshot: true
      },
      getMessage: async (key) => {
        if (!key) return undefined;
        return {
          conversation: 'Message not found'
        };
      }
    });

    const extender = new SocketExtender(sock, db);
    sock = extender.extend();

    if (!state.creds?.registered && !isWaitingForPairing) {
      log.info(`Requesting pairing code for: ${botNumber}...`);
      const timer = setTimeout(async () => {
        activeTimers.delete(timer);
        try {
          if (!sock.authState?.creds?.registered) {
            isWaitingForPairing = true;
            const phoneNumber = botNumber.replace(/[^0-9]/g, '');
            const code = await sock.requestPairingCode(phoneNumber);
            const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;
            console.log(`\n╔════════════════════════════════╗`);
            console.log(`║   Pairing Code: ${formattedCode}   ║`);
            console.log(`╚════════════════════════════════╝\n`);
            console.log('Enter this code in your WhatsApp: Settings > Linked Devices > Link a Device');
            console.log(`\nWaiting for pairing... (Do not close this window)`);
          }
        } catch (error) {
          log.error('Error requesting pairing code: ' + error.message);
          isWaitingForPairing = false;
        }
      }, 3000);
      activeTimers.add(timer);
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;

      if (receivedPendingNotifications && !sock.authState?.creds?.myAppStateKeyId) {
        sock.ev.flush();
      }

      if (connection === 'connecting') {
        if (sessionExists) {
          log.info('Session found, connecting...');
        } else if (isWaitingForPairing) {
          log.info('Waiting for pairing...');
        }
      }

      if (connection === 'open') {
        isReconnecting = false;
        isWaitingForPairing = false;
        log.success('Connected to WhatsApp');
        isSockReady = true;
        flushPendingMessages();
      }

      if (connection === 'close') {
        if (isReconnecting) {
          return;
        }

        const statusCode = lastDisconnect?.error?.output?.statusCode;

        if (isWaitingForPairing && (statusCode === 405 || statusCode === 428)) {
          log.info('Waiting for pairing. Please enter the pairing code in WhatsApp...');
          return;
        }

        switch (statusCode) {
          case 408:
            log.error('Connection timed out. Restarting...');
            reconnectBot(3000);
            break;
          case 503:
            log.error('Unavailable service. Restarting...');
            reconnectBot(3000);
            break;
          case 428:
            log.info('Connection closed. Restarting...');
            reconnectBot(3000);
            break;
          case 515:
            log.info('Need to restart. Restarting...');
            reconnectBot(3000);
            break;
          case 401:
            log.info('Session logged out. Recreating session...');
            clearSessionAndRestart(3000);
            break;
          case 403:
          case 500:
            log.error('Your WhatsApp has been banned');
            clearSessionAndRestart(60000);
            break;
          case 405:
            log.info('Session not logged in. Recreating session...');
            clearSessionAndRestart(3000);
            break;
          default:
            log.info(`Connection closed (${statusCode || 'unknown'}). Restarting...`);
            reconnectBot(3000);
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
      const messages = m.messages;
      for (const msg of messages) {
        if (msg.message) {
          if (!isSockReady) {
            const now = Date.now();
            pendingMessages.push({ msg, at: now });
            if (pendingMessages.length > MAX_PENDING_MESSAGES) {
              const expired = pendingMessages.filter(p => now - p.at > PENDING_MESSAGE_TTL);
              expired.forEach(() => pendingMessages.shift());
              if (pendingMessages.length > MAX_PENDING_MESSAGES) {
                pendingMessages.splice(0, pendingMessages.length - MAX_PENDING_MESSAGES);
              }
            }
            continue;
          }
          await handleIncomingMessage(msg);
        }
      }
    });

    sock.ev.on('contacts.update', async (update) => {
      for (const contact of update) {
        console.log(formatContactLog(contact, 'update', sock));
        const id = jidNormalizedUser(contact.id);
        if (db) {
          const existing = db.get('contacts', id, {});
          db.set('contacts', id, {
            ...existing,
            ...contact
          });
        }
      }
    });

    sock.ev.on('contacts.upsert', async (update) => {
      for (const contact of update) {
        console.log(formatContactLog(contact, 'upsert', sock));
        const id = jidNormalizedUser(contact.id);
        if (db) {
          db.set('contacts', id, {
            ...contact,
            isContact: true
          });
        }
      }
    });

    commandHandler.setPrefix(config.bot.prefix);
    sock.config = config.bot;

  } catch (error) {
    log.error('Error starting bot: ' + error.message);
    if (!isWaitingForPairing) {
      log.info('Auto restarting in 5 seconds...');
      reconnectBot(5000);
    } else {
      log.info('Error occurred while waiting for pairing. Bot will continue waiting...');
    }
  }
}

function reconnectBot(timeout) {
  isReconnecting = true;
  const timer = setTimeout(() => {
    activeTimers.delete(timer);
    isReconnecting = false;
    startBot();
  }, timeout);
  activeTimers.add(timer);
}

async function clearSessionAndRestart(timeout) {
  try {
    const { rmSync, mkdirSync } = await import('fs');
    rmSync(config.bot.sessionPath, { recursive: true, force: true });
    mkdirSync(config.bot.sessionPath, { recursive: true });
    log.success('Session removed!');
  } catch (e) {
    log.info('Session not found!');
  }
  reconnectBot(timeout);
}

async function loadCommands() {
  try {
    await commandHandler.loadCommands();
    log.success('Commands loaded');
    setupHotReload();
  } catch (error) {
    log.error('Error loading commands: ' + error.message);
  }
}

function setupHotReload() {
  if (hotReloadStarted) return;
  hotReloadStarted = true;
  const watchDirs = ['cmd', 'lib'];

  watchDirs.forEach(dir => {
    const dirPath = join(process.cwd(), dir);
    if (!existsSync(dirPath)) return;

    try {
      const watcher = watch(dirPath, { recursive: true }, async (eventType, filename) => {
        if (!filename || !filename.endsWith('.js')) return;
        if (filename.includes('node_modules')) return;

        const filePath = join(dirPath, filename);
        const relPath = relative(process.cwd(), filePath);

        const timer = setTimeout(async () => {
          activeTimers.delete(timer);
          try {
            if (dir === 'cmd') {
              console.log(`\n🔄 Hot reload: ${relPath}`);
              const oldSize = commandHandler.commands.size;
              await commandHandler.loadCommandFile(filePath, true);
              const newSize = commandHandler.commands.size;
              console.log(`✓ Hot reloaded: ${relPath} (${oldSize} → ${newSize} commands)`);
            } else if (dir === 'lib') {
              console.log(`\n🔄 Hot reload: ${relPath}`);
              const fileUrl = pathToFileURL(filePath).href + `?t=${Date.now()}`;
              await import(fileUrl);
              console.log(`✓ Hot reloaded: ${relPath}`);
            }
          } catch (error) {
            console.error(`✗ Hot reload failed for ${relPath}:`, error.message);
          }
        }, 100);
        activeTimers.add(timer);
      });
      watcher.on('error', (err) => {
        console.error(`Watcher error (${dir}):`, err?.message || err);
      });
      hotReloadWatchers.push(watcher);
    } catch (error) {
      console.error(`Error setting up watcher for ${dir}:`, error.message);
    }
  });
}


async function handleIncomingMessage(msg) {
  try {
    const pushName = msg.pushName || '';
    console.log(formatLog(msg, pushName, sock));

    // 1. Panggil serialize baru menggunakan "await"
    const m = await serialize(sock, msg);

    // 2. Jika pesan tidak valid, hentikan proses
    if (!m) return;

    if (!msg.key?.fromMe) {
      await schema.schema(m, sock, db);
    }


    // Auto Read Status
    if (!m.isOwner && m.key.remoteJid === 'status@broadcast') {
      if (m.type === 'protocolMessage' && m.message.protocolMessage.type === 0) return;

      setTimeout(async () => {
        try {
          // [OPSIONAL] Jika kamu BENAR-BENAR ingin cek privasi secara dinamis:
          // Pastikan variabel bot kamu adalah 'sock', bukan 'hisoka'
          const privacySettings = await sock.fetchPrivacySettings();
          const readType = privacySettings.readreceipts === 'all' ? 'read' : 'read-self';

          // Gunakan sendReceipt bawaan Baileys (lebih akurat untuk status)
          await sock.sendReceipt(
            [m.key],
            readType
          );

        } catch (err) {
          console.error('Gagal read status:', err);
        }
      }, 2000); // Jeda 2 detik

      if (config.tele.TELEGRAM_TOKEN && config.tele.ID_TELEGRAM) {
        let id = m.key.participant || m.key.remoteJid;
        let name = m.pushName;

        let text = `Status dari ${name} (${id.split('@')[0]})\n${m.body || ''}`;

        if (m.isMedia) {
          let media = await sock.downloadMediaMessage(m);
          sendTelegram(config.tele.ID_TELEGRAM, media, { type: /audio/.test(m.msg.mimetype) ? 'document' : '', caption: text }).catch(() => { });
        } else {
          sendTelegram(config.tele.ID_TELEGRAM, text).catch(() => { });
        }
      }

    }
    await messageProcessor.process(sock, m, db);

  } catch (error) {
    console.error('Message processing error:', error?.message || error);
  } finally {
    if (global.gc && Math.random() < 0.01) {
      global.gc();
    }
  }
}
/*
async function handleIncomingMessage(msg) {
  try {
    const pushName = msg.pushName || '';
    console.log(formatLog(msg, pushName, sock));

    // Menggunakan instance dari MessageSerializer
    const m = messageSerializer.serialize(msg, false, sock, db);

    if (m && !msg.key?.fromMe) {
      await schema.schema(m, sock, db);
    }

    if (m.key && !m.key.fromMe && m.key.remoteJid === 'status@broadcast') {
      if (m.msgType === 'protocolMessage') return;

      m.sock.readMessages([m.key]).catch(() => { });

      if (config.tele.TELEGRAM_TOKEN && config.tele.ID_TELEGRAM) {
        let id = m.key.participant || m.key.remoteJid;
        let name = m.pushName;

        let text = `Status dari ${name} (${id.split('@')[0]})\n${m.body || ''}`;

        if (m.isMedia) {
          let media = await sock.downloadMediaMessage(m);
          sendTelegram(config.tele.ID_TELEGRAM, media, { type: /audio/.test(m.msg.mimetype) ? 'document' : '', caption: text }).catch(() => { });
        } else {
          sendTelegram(config.tele.ID_TELEGRAM, text).catch(() => { });
        }
      }

    }

    // Menggunakan instance dari MessageProcessor
    await messageProcessor.process(sock, msg, db);

  } catch (error) {
    console.error('Message processing error:', error?.message || error);
  } finally {
    if (global.gc && Math.random() < 0.01) {
      global.gc();
    }
  }
}
*/
async function flushPendingMessages() {
  if (flushingPending) return;
  flushingPending = true;
  try {
    const now = Date.now();
    const validMessages = [];
    for (let i = pendingMessages.length - 1; i >= 0; i--) {
      const item = pendingMessages[i];
      if (!item?.msg?.message) {
        pendingMessages.splice(i, 1);
        continue;
      }
      if (now - item.at > PENDING_MESSAGE_TTL) {
        pendingMessages.splice(i, 1);
        continue;
      }
      validMessages.unshift(item);
    }
    pendingMessages.length = 0;
    for (const item of validMessages) {
      await handleIncomingMessage(item.msg);
    }
  } finally {
    flushingPending = false;
  }
}

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});

async function cleanup() {
  log.info('\nShutting down...');

  activeTimers.forEach(timer => clearTimeout(timer));
  activeTimers.clear();

  hotReloadWatchers.forEach(watcher => {
    try {
      watcher.close();
    } catch (e) { }
  });
  hotReloadWatchers.length = 0;

  pendingMessages.length = 0;

  if (sock) {
    try {
      await sock.end();
    } catch (e) { }
    sock = null;
  }

  await db.disconnect();
}

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(0);
});

startBot();