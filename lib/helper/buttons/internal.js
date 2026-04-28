
export function getButtonType(message) {
    if (message.listMessage) {
        return 'list';
    } else if (message.buttonsMessage) {
        return 'buttons';
    } else if (message.interactiveMessage?.nativeFlowMessage) {
        return 'native_flow';
    }
    return null;
}

export function getButtonArgs(message) {
    const nativeFlow = message.interactiveMessage?.nativeFlowMessage;
    const firstButtonName = nativeFlow?.buttons?.[0]?.name;
    const nativeFlowSpecials = [
        'mpm', 'cta_catalog', 'send_location',
        'call_permission_request', 'wa_payment_transaction_details',
        'automated_greeting_message_view_catalog'
    ];

    if (nativeFlow && (firstButtonName === 'review_and_pay' || firstButtonName === 'payment_info')) {
        return {
            tag: 'biz',
            attrs: {
                native_flow_name: firstButtonName === 'review_and_pay' ? 'order_details' : firstButtonName
            }
        };
    } else if (nativeFlow && nativeFlowSpecials.includes(firstButtonName)) {
        return {
            tag: 'biz',
            attrs: {},
            content: [{
                tag: 'interactive',
                attrs: { type: 'native_flow', v: '1' },
                content: [{ tag: 'native_flow', attrs: { v: '2', name: firstButtonName } }]
            }]
        };
    } else if (nativeFlow || message.buttonsMessage) {
        return {
            tag: 'biz',
            attrs: {},
            content: [{
                tag: 'interactive',
                attrs: { type: 'native_flow', v: '1' },
                content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
            }]
        };
    } else if (message.listMessage) {
        return {
            tag: 'biz',
            attrs: {},
            content: [{ tag: 'list', attrs: { v: '2', type: 'product_list' } }]
        };
    } else {
        return { tag: 'biz', attrs: {} };
    }
}