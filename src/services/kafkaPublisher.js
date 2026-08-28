import { producer } from '../config/kafka.js';

export const publishTransferEvent = async (eventPayload) => {
    try {
        await producer.send({
            topic: 'transfer-notifications', 
            messages: [
                {
                    key: String(eventPayload.txId), 
                    value: JSON.stringify(eventPayload)
                }
            ]
        });

        console.log(`[KAFKA PRODUCER] Event published for TxID: ${eventPayload.txId}`);
    } catch (error) {
        console.error('[KAFKA PRODUCER ERROR] Failed to publish event:', error.message);
    }
};