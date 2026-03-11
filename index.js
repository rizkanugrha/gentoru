import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser
} from 'baileys';
import pino from 'pino';
import { existsSync, mkdirSync, readFileSync, writeFileSync, watch } from 'fs';
import { join, relative } from 'path';
import { createInterface } from 'readline';
import { pathToFileURL } from 'url';
import config from './config.js';
import db from './lib/database.js';
import commandHandler from './lib/command.js';
import schema from './lib/db/schema.js';

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

let sock = null;
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

function formatPhoneNumber(number) {
  let formatted = number.trim().replace(/[^0-9]/g, '');
  if (formatted.startsWith('0')) {
    formatted = '62' + formatted.substring(1);
  } else if (!formatted.startsWith('62')) {
    formatted = '62' + formatted;
  }
  return formatted;
}

function getMessageType(message) {
  if (message?.conversation) return 'text';
  if (message?.extendedTextMessage) return 'text';
  if (message?.imageMessage) return 'image';
  if (message?.videoMessage) return 'video';
  if (message?.audioMessage) return 'audio';
  if (message?.documentMessage) return 'document';
  if (message?.stickerMessage) return 'sticker';
  if (message?.locationMessage) return 'location';
  if (message?.contactMessage) return 'contact';
  if (message?.buttonsResponseMessage) return 'button';
  if (message?.listResponseMessage) return 'list';
  if (message?.templateButtonReplyMessage) return 'template';
  if (message?.reactionMessage) return 'reaction';
  if (message?.protocolMessage) return 'protocol';
  return 'unknown';
}

function getMessageText(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    message?.documentMessage?.caption ||
    message?.audioMessage?.caption ||
    message?.stickerMessage?.caption ||
    message?.locationMessage?.caption ||
    message?.contactMessage?.displayName ||
    message?.buttonsResponseMessage?.selectedButtonId ||
    message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    message?.templateButtonReplyMessage?.selectedId ||
    ''
  );
}

function formatLog(msg, pushName) {
  const isLid = msg?.key?.addressingMode === 'lid';
  const remoteJid = isLid
    ? (msg?.key?.remoteJidAlt || msg?.remoteJidAlt || msg?.key?.remoteJid)
    : msg?.key?.remoteJid;
  const isGroup = remoteJid && remoteJid.endsWith('@g.us');
  const participant = isGroup
    ? (isLid
      ? (msg?.key?.participantAlt || msg?.participantAlt || msg?.key?.participant || msg?.participant)
      : (msg?.key?.participant || msg?.participant))
    : null;
  const sender = isGroup
    ? (participant ? participant.split('@')[0] : (remoteJid ? remoteJid.split('@')[0] : ''))
    : (remoteJid ? remoteJid.split('@')[0] : '');

  const messageType = getMessageType(msg?.message);
  const text = getMessageText(msg?.message);
  const timestamp = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const typeIcons = {
    text: '💬',
    image: '🖼️',
    video: '🎥',
    audio: '🎵',
    document: '📄',
    sticker: '🎨',
    location: '📍',
    contact: '👤',
    button: '🔘',
    list: '📋',
    template: '📝',
    reaction: '👍',
    protocol: '⚙️',
    unknown: '❓'
  };

  const icon = typeIcons[messageType] || '❓';
  const typeLabel = messageType.toUpperCase();

  const jidToGet = isGroup && participant ? participant : remoteJid;
  let name = pushName;

  if (!name || /^\+?\d+[\s\-]?\d+[\s\-]?\d+[\s\-]?\d+$/.test(name) || /^\d+$/.test(name)) {
    if (sock && sock.getName) {
      const getNameResult = sock.getName(jidToGet);
      if (getNameResult && getNameResult !== 'none' && getNameResult !== 'Group') {
        name = getNameResult;
        if (/^\+?\d+[\s\-]?\d+[\s\-]?\d+[\s\-]?\d+$/.test(name) || /^\d+$/.test(name)) {
          name = sender;
        }
      } else {
        name = sender;
      }
    } else {
      name = sender;
    }
  }

  const groupInfo = isGroup ? 'GROUP' : 'PRIVATE';

  const terminalWidth = process.stdout.columns || 80;
  const maxWidth = Math.min(terminalWidth - 2, 100);

  const header = `${icon} ${typeLabel} [${groupInfo}] ${timestamp}`;
  const fromLine = `From: ${name} (${sender})`;
  let logLines = [fromLine];

  if (isGroup) {
    logLines.push(`Group: ${remoteJid.split('@')[0]}`);
  }

  if (text && text.trim()) {
    const displayText = text.replace(/\n/g, ' ');
    const maxTextLength = maxWidth - 8;
    const truncatedText = displayText.length > maxTextLength
      ? displayText.substring(0, maxTextLength - 3) + '...'
      : displayText;
    logLines.push(`Text: ${truncatedText}`);
  }

  const border = '─'.repeat(maxWidth);

  let logOutput = `\n╭─ ${header} ─${'─'.repeat(Math.max(0, maxWidth - header.length - 4))}╮\n`;
  logLines.forEach(line => {
    const truncatedLine = line.length > maxWidth - 4
      ? line.substring(0, maxWidth - 7) + '...'
      : line;
    logOutput += `│ ${truncatedLine.padEnd(maxWidth - 4)} │\n`;
  });
  logOutput += `╰${border}╯`;

  return logOutput;
}

function getBotNumber() {
  return new Promise((resolve) => {
    const noJsonPath = './no.json';

    if (existsSync(noJsonPath)) {
      try {
        const data = JSON.parse(readFileSync(noJsonPath, 'utf-8'));
        if (data.number) {
          const formatted = formatPhoneNumber(data.number);
          if (formatted !== data.number) {
            writeFileSync(noJsonPath, JSON.stringify({ number: formatted }, null, 2));
            log.info(`Updated bot number format: ${formatted}`);
          }
          log.info(`Using saved bot number: ${formatted}`);
          resolve(formatted);
          return;
        }
      } catch (error) {
        log.error('Error reading no.json:', error.message);
      }
    }

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Masukkan nomor bot (contoh: 6281234567890 atau 085123456789): ', (answer) => {
      const number = formatPhoneNumber(answer);
      if (number && number.length >= 10) {
        writeFileSync(noJsonPath, JSON.stringify({ number }, null, 2));
        log.success(`Bot number saved: ${number}`);
        resolve(number);
      } else {
        log.error('Nomor tidak valid!');
        process.exit(1);
      }
      rl.close();
    });
  });
}

function hasSession() {
  const credsPath = `${config.bot.sessionPath}/creds.json`;
  return existsSync(credsPath);
}

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
      } catch (e) {
      }
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
      botNumber = await getBotNumber();
    }

    if (!commandsLoaded) {
      await loadCommands();
      commandsLoaded = true;
    }

    const { state, saveCreds } = await useMultiFileAuthState(config.bot.sessionPath);
    const sessionExists = hasSession() && state.creds?.registered;

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
            isReconnecting = true;
            const timer1 = setTimeout(() => {
              activeTimers.delete(timer1);
              isReconnecting = false;
              startBot();
            }, 3000);
            activeTimers.add(timer1);
            break;
          case 503:
            log.error('Unavailable service. Restarting...');
            isReconnecting = true;
            const timer2 = setTimeout(() => {
              activeTimers.delete(timer2);
              isReconnecting = false;
              startBot();
            }, 3000);
            activeTimers.add(timer2);
            break;
          case 428:
            log.info('Connection closed. Restarting...');
            isReconnecting = true;
            const timer3 = setTimeout(() => {
              activeTimers.delete(timer3);
              isReconnecting = false;
              startBot();
            }, 3000);
            activeTimers.add(timer3);
            break;
          case 515:
            log.info('Need to restart. Restarting...');
            isReconnecting = true;
            const timer4 = setTimeout(() => {
              activeTimers.delete(timer4);
              isReconnecting = false;
              startBot();
            }, 3000);
            activeTimers.add(timer4);
            break;
          case 401:
            log.info('Session logged out. Recreating session...');
            try {
              const { rmSync, mkdirSync } = await import('fs');
              rmSync(config.bot.sessionPath, { recursive: true, force: true });
              mkdirSync(config.bot.sessionPath, { recursive: true });
              log.success('Session removed!');
            } catch (e) {
              log.info('Session not found!');
            }
            isReconnecting = true;
            const timer5 = setTimeout(() => {
              activeTimers.delete(timer5);
              isReconnecting = false;
              startBot();
            }, 3000);
            activeTimers.add(timer5);
            break;
          case 403:
          case 500:
            log.error('Your WhatsApp has been banned');
            try {
              const { rmSync, mkdirSync } = await import('fs');
              rmSync(config.bot.sessionPath, { recursive: true, force: true });
              mkdirSync(config.bot.sessionPath, { recursive: true });
            } catch (e) { }
            isReconnecting = true;
            const timer6 = setTimeout(() => {
              activeTimers.delete(timer6);
              isReconnecting = false;
              startBot();
            }, 60000);
            activeTimers.add(timer6);
            break;
          case 405:
            log.info('Session not logged in. Recreating session...');
            try {
              const { rmSync, mkdirSync } = await import('fs');
              rmSync(config.bot.sessionPath, { recursive: true, force: true });
              mkdirSync(config.bot.sessionPath, { recursive: true });
              log.success('Session removed!');
            } catch (e) {
              log.info('Session not found!');
            }
            isReconnecting = true;
            const timer7 = setTimeout(() => {
              activeTimers.delete(timer7);
              isReconnecting = false;
              startBot();
            }, 3000);
            activeTimers.add(timer7);
            break;
          default:
            log.info(`Connection closed (${statusCode || 'unknown'}). Restarting...`);
            isReconnecting = true;
            const timer8 = setTimeout(() => {
              activeTimers.delete(timer8);
              isReconnecting = false;
              startBot();
            }, 3000);
            activeTimers.add(timer8);
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    function parsePhoneNumber(number) {
      let cleaned = ('' + number).replace(/\D/g, '');
      if (cleaned?.startsWith('62')) {
        if (cleaned.length >= 11 && cleaned.length <= 13) {
          return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 6)} ${cleaned.slice(6, 10)} ${cleaned.slice(10)}`;
        } else if (cleaned.length === 10) {
          return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 6)} ${cleaned.slice(6)}`;
        } else if (cleaned.length === 9) {
          return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 5)} ${cleaned.slice(5)}`;
        }
      }
      return '+' + cleaned;
    }

    sock.getName = (jid) => {
      let id = jidNormalizedUser(jid);
      if (!id || typeof id !== 'string') return 'none';
      if (id.endsWith('g.us')) {
        return 'Group';
      } else {
        const contact = db.get('contacts', id, {});
        return (
          contact?.name ||
          contact?.verifiedName ||
          contact?.notify ||
          parsePhoneNumber(id.split('@')[0])
        );
      }
    };

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

    function formatContactLog(contact, eventType) {
      const timestamp = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const terminalWidth = process.stdout.columns || 80;
      const maxWidth = Math.min(terminalWidth - 2, 100);

      const id = jidNormalizedUser(contact.id);
      const name = contact.name || contact.verifiedName || contact.notify || sock.getName(id) || id.split('@')[0];
      const phone = id.split('@')[0];

      const header = `👤 CONTACT [${eventType.toUpperCase()}] ${timestamp}`;
      const nameLine = `Name: ${name}`;
      const phoneLine = `Phone: ${phone}`;
      let logLines = [nameLine, phoneLine];

      if (contact.notify) {
        logLines.push(`Notify: ${contact.notify}`);
      }

      const border = '─'.repeat(maxWidth);
      let logOutput = `\n╭─ ${header} ─${'─'.repeat(Math.max(0, maxWidth - header.length - 4))}╮\n`;
      logLines.forEach(line => {
        const truncatedLine = line.length > maxWidth - 4
          ? line.substring(0, maxWidth - 7) + '...'
          : line;
        logOutput += `│ ${truncatedLine.padEnd(maxWidth - 4)} │\n`;
      });
      logOutput += `╰${border}╯`;

      return logOutput;
    }

    sock.ev.on('contacts.update', async (update) => {
      for (const contact of update) {
        console.log(formatContactLog(contact, 'update'));
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
        console.log(formatContactLog(contact, 'upsert'));
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
      isReconnecting = true;
      const timer = setTimeout(() => {
        activeTimers.delete(timer);
        isReconnecting = false;
        startBot();
      }, 5000);
      activeTimers.add(timer);
    } else {
      log.info('Error occurred while waiting for pairing. Bot will continue waiting...');
    }
  }
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
    console.log(formatLog(msg, pushName));
    const tch = commandHandler.serializeTch(msg, false, sock, db);
    if (tch && !msg.key?.fromMe) {
      await schema.schema(tch, sock, db);
    }
    await commandHandler.process(sock, msg, db);
  } catch (error) {
    console.error('Message processing error:', error?.message || error);
  } finally {
    if (global.gc && Math.random() < 0.01) {
      global.gc();
    }
  }
}

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
