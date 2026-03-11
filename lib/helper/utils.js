import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { jidNormalizedUser } from 'baileys';

export function formatPhoneNumber(number) {
    let formatted = number.trim().replace(/[^0-9]/g, '');
    if (formatted.startsWith('0')) {
        formatted = '62' + formatted.substring(1);
    } else if (!formatted.startsWith('62')) {
        formatted = '62' + formatted;
    }
    return formatted;
}

export function getMessageType(message) {
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

export function getMessageText(message) {
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

export function formatLog(msg, pushName, sock) {
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
        text: '💬', image: '🖼️', video: '🎥', audio: '🎵',
        document: '📄', sticker: '🎨', location: '📍', contact: '👤',
        button: '🔘', list: '📋', template: '📝', reaction: '👍',
        protocol: '⚙️', unknown: '❓'
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

export function formatContactLog(contact, eventType, sock) {
    const timestamp = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const terminalWidth = process.stdout.columns || 80;
    const maxWidth = Math.min(terminalWidth - 2, 100);

    const id = jidNormalizedUser(contact.id);
    const name = contact.name || contact.verifiedName || contact.notify || (sock && sock.getName ? sock.getName(id) : id.split('@')[0]) || id.split('@')[0];
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

export function getBotNumber(log) {
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

        const number = formatPhoneNumber('085314240519');
        if (number && number.length >= 10) {
            writeFileSync(noJsonPath, JSON.stringify({ number }, null, 2));
            log.success(`Bot number saved: ${number}`);
            resolve(number);
        } else {
            log.error('Nomor tidak valid!');
            process.exit(1);
        }

    });
}

export function hasSession(sessionPath) {
    const credsPath = `${sessionPath}/creds.json`;
    return existsSync(credsPath);
}

export function parsePhoneNumber(number) {
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