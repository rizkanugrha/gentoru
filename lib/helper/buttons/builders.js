/**
 * Berisi fungsi utilitas untuk membangun dan mengubah
 * struktur data pesan interaktif.
 */

export function buildInteractiveButtons(buttons = []) {
    return buttons.map((b, i) => {
        // 1. Already full shape
        if (b && b.name && b.buttonParamsJson) return b;

        // 2. Legacy quick reply style -> wrap
        if (b && (b.id || b.text)) {
            return {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: b.text || b.displayText || 'Button ' + (i + 1),
                    id: b.id || ('quick_' + (i + 1))
                })
            };
        }

        // 3. Old Baileys style
        if (b && b.buttonId && b.buttonText?.displayText) {
            return {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({
                    display_text: b.buttonText.displayText,
                    id: b.buttonId
                })
            };
        }

        // 4. Unknown shape
        return b;
    });
}

export function convertToInteractiveMessage(content) {
    if (content.interactiveButtons && content.interactiveButtons.length > 0) {
        const interactiveMessage = {
            nativeFlowMessage: {
                buttons: content.interactiveButtons.map(btn => ({
                    name: btn.name || 'quick_reply',
                    buttonParamsJson: btn.buttonParamsJson
                }))
            }
        };

        if (content.title || content.subtitle) {
            interactiveMessage.header = {
                title: content.title || content.subtitle || ''
            };
        }
        if (content.text) {
            interactiveMessage.body = { text: content.text };
        }
        if (content.footer) {
            interactiveMessage.footer = { text: content.footer };
        }

        const newContent = { ...content };
        delete newContent.interactiveButtons;
        delete newContent.title;
        delete newContent.subtitle;
        delete newContent.text;
        delete newContent.footer;

        return { ...newContent, interactiveMessage };
    }
    return content;
}