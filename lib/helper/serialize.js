export class MessageSerializer {
    getTextFromMessage(message) {
        if (!message) return '';
        return message?.conversation ||
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
            message?.listResponseMessage?.title || message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
            (message?.interactiveMessage?.body?.text || message?.interactiveMessage?.footer?.text) ||
            (message?.pollCreationMessage?.name || message?.pollUpdateMessage?.name) ||
            '';
    }

    serialize(msg, isQuoted = false, sock = null, db = null) {
        const key = isQuoted ? msg?.key : msg.key;
        const message = isQuoted ? msg?.message : msg.message;
        const pushName = isQuoted ? undefined : msg.pushName;

        if (!key) return null;

        const isLid = key.addressingMode === 'lid';
        const remoteJid = (isLid ? (key.remoteJidAlt || msg.remoteJidAlt || key.remoteJid) : key.remoteJid) || key.remoteJid;
        if (!remoteJid) return null;

        const isGroup = remoteJid.endsWith('@g.us');
        const participantJid = isGroup
            ? (isLid
                ? (key.participantAlt || msg.participantAlt || key.participant || msg.participant)
                : (key.participant || msg.participant))
            : remoteJid;

        const senderJid = (isGroup ? participantJid : remoteJid) || remoteJid;
        const senderNumber = senderJid.split('@')[0];
        let name = pushName;

        if (!name || /^\+?\d+[\s\-]?\d+[\s\-]?\d+[\s\-]?\d+$/.test(name) || /^\d+$/.test(name)) {
            if (sock && typeof sock.getName === 'function') {
                const getNameResult = sock.getName(senderJid);
                if (getNameResult && getNameResult !== 'none' && getNameResult !== 'Group') {
                    name = getNameResult;
                    if (/^\+?\d+[\s\-]?\d+[\s\-]?\d+[\s\-]?\d+$/.test(name) || /^\d+$/.test(name)) {
                        name = senderNumber;
                    }
                } else {
                    name = senderNumber;
                }
            } else if (db) {
                // Mendukung pemanggilan DB lokal (SQLite/MySQL) jika diimplementasikan
                const contact = typeof db.get === 'function' ? db.get('contacts', senderJid, {}) : null;
                name = contact?.name || contact?.verifiedName || contact?.notify;
                if (!name || /^\+?\d+[\s\-]?\d+[\s\-]?\d+[\s\-]?\d+$/.test(name) || /^\d+$/.test(name)) {
                    name = senderNumber;
                }
            } else {
                name = senderNumber;
            }
        }

        return {
            key: {
                remoteJid: remoteJid,
                fromMe: key.fromMe,
                id: key.id,
                participant: participantJid
            },
            from: remoteJid,
            sender: senderJid,
            name: name,
            text: this.getTextFromMessage(message),
            msg: message
        };
    }
}