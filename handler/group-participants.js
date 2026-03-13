/**
 * Author  : Rizka Nugraha
 * Name    : violet-rzk
 * Version : 2.8.24
 * Update  : 28 September 2024
 *
 * If you are a reliable programmer or the best developer, please don't change anything.
 * If you want to be appreciated by others, then don't change anything in this script.
 * Please respect me for making this tool from the beginning.
 */

import { jidNormalizedUser } from "baileys";

export async function GroupParticipants(anu, client) {
    try {
        const botNumber = client.user.id;
        const jid = anu.id;

        // Mendapatkan metadata grup dari database dan store
        const meta = await client.groupMetadata(jid);
        // const group = await groupManage.get(jid);
        const participants = anu.participants || [];


        // Looping setiap peserta yang mengalami perubahan
        for (const x of participants) {
            if (x === botNumber) continue; // Abaikan jika peserta adalah bot
            if (anu.action === 'add') {
                meta.participants.push({ id: jidNormalizedUser(x), admin: null });

            } else if (anu.action === 'remove') {
                meta.participants = meta.participants.filter(
                    (p) => p.id !== jidNormalizedUser(x)
                );

            }


        }

        // Penanganan promosi dan demosi
        if (['promote', 'demote'].includes(anu.action)) {
            for (const participant of meta.participants) {
                const id = jidNormalizedUser(participant.id);

                if (participants.includes(id)) {
                    participant.admin =
                        anu.action === 'promote' ? 'admin' : null;
                }
            }
        }
    } catch (error) {
        console.error('Error in GroupParticipants handler:', error);
    }
}
