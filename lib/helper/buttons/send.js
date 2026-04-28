/**
 * Berisi logika inti untuk mengirim pesan interaktif.
 * 
 */

import {
    InteractiveValidationError,
    EXAMPLE_PAYLOADS,
    validateSendButtonsPayload,
    validateSendInteractiveMessagePayload,
    validateInteractiveMessageContent,
    validateAuthoringButtons
} from './validators.js';
import { buildInteractiveButtons, convertToInteractiveMessage } from './builders.js';
import { getButtonType, getButtonArgs } from './internal.js';

import {
    generateWAMessageFromContent,
    normalizeMessageContent,
    isJidGroup,
    generateMessageIDV2
} from 'baileys';

/**
 * Low‑level power helper that sends any interactive message.
 */
export async function sendInteractiveMessage(sock, jid, content, options = {}) {
    if (!sock) {
        throw new InteractiveValidationError('Socket is required', { context: 'sendInteractiveMessage' });
    }

    if (content && Array.isArray(content.interactiveButtons)) {
        const strict = validateSendInteractiveMessagePayload(content);
        if (!strict.valid) {
            throw new InteractiveValidationError('Interactive authoring payload invalid', {
                context: 'sendInteractiveMessage.validateSendInteractiveMessagePayload',
                errors: strict.errors,
                warnings: strict.warnings,
                example: EXAMPLE_PAYLOADS.sendInteractiveMessage
            });
        }
        if (strict.warnings.length) console.warn('sendInteractiveMessage warnings:', strict.warnings);
    }

    const convertedContent = convertToInteractiveMessage(content);
    const { errors: contentErrors, warnings: contentWarnings, valid: contentValid } = validateInteractiveMessageContent(convertedContent);

    if (!contentValid) {
        throw new InteractiveValidationError('Converted interactive content invalid', {
            context: 'sendInteractiveMessage.validateInteractiveMessageContent',
            errors: contentErrors,
            warnings: contentWarnings,
            example: convertToInteractiveMessage(EXAMPLE_PAYLOADS.sendInteractiveMessage)
        });
    }
    if (contentWarnings.length) {
        console.warn('Interactive content warnings:', contentWarnings);
    }

    // --- LOGIKA PENGIRIMAN ---

    // relayMessage diambil langsung dari socket instance
    const relayMessage = sock.relayMessage;

    const userJid = sock.authState?.creds?.me?.id || sock.user?.id;

    // Menggunakan fungsi helper yang diimpor dari @whiskeysockets/baileys
    const fullMsg = generateWAMessageFromContent(jid, convertedContent, {
        logger: sock.logger,
        userJid,
        messageId: generateMessageIDV2(userJid),
        timestamp: new Date(),
        ...options
    });

    const normalizedContent = normalizeMessageContent(fullMsg.message);
    const buttonType = getButtonType(normalizedContent);
    let additionalNodes = [...(options.additionalNodes || [])];

    if (buttonType) {
        const buttonsNode = getButtonArgs(normalizedContent);
        const isPrivate = !isJidGroup(jid);
        additionalNodes.push(buttonsNode);
        if (isPrivate) {
            additionalNodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
        }
        console.log('Interactive send: ', {
            type: buttonType,
            nodes: additionalNodes.map(n => ({ tag: n.tag, attrs: n.attrs })),
            private: !isJidGroup(jid)
        });
    }

    await relayMessage(jid, fullMsg.message, {
        messageId: fullMsg.key.id,
        useCachedGroupMetadata: options.useCachedGroupMetadata,
        additionalAttributes: options.additionalAttributes || {},
        statusJidList: options.statusJidList,
        additionalNodes
    });

    const isPrivateChat = !isJidGroup(jid);
    if (sock.config?.emitOwnEvents && isPrivateChat) {
        process.nextTick(() => {
            if (sock.processingMutex?.mutex && sock.upsertMessage) {
                sock.processingMutex.mutex(() => sock.upsertMessage(fullMsg, 'append'));
            }
        });
    }

    return fullMsg;
}

/**
 * Public convenience wrapper.
 */
export async function sendInteractiveButtonsBasic(sock, jid, data = {}, options = {}) {
    if (!sock) {
        throw new InteractiveValidationError('Socket is required', { context: 'sendButtons' });
    }

    const { text = '', footer = '', title, subtitle, buttons = [] } = data;
    const strict = validateSendButtonsPayload({ text, buttons, title, subtitle, footer });

    if (!strict.valid) {
        throw new InteractiveValidationError('Buttons payload invalid', {
            context: 'sendButtons.validateSendButtonsPayload',
            errors: strict.errors,
            warnings: strict.warnings,
            example: EXAMPLE_PAYLOADS.sendButtons
        });
    }
    if (strict.warnings.length) console.warn('sendButtons warnings:', strict.warnings);

    const { errors, warnings, cleaned } = validateAuthoringButtons(buttons);
    if (errors.length) {
        throw new InteractiveValidationError('Authoring button objects invalid', {
            context: 'sendButtons.validateAuthoringButtons',
            errors,
            warnings,
            example: EXAMPLE_PAYLOADS.sendButtons.buttons
        });
    }
    if (warnings.length) {
        console.warn('Button validation warnings:', warnings);
    }

    const interactiveButtons = buildInteractiveButtons(cleaned);
    const payload = { text, footer, interactiveButtons };
    if (title) payload.title = title;
    if (subtitle) payload.subtitle = subtitle;

    return sendInteractiveMessage(sock, jid, payload, options);
}