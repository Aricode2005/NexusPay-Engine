import { producer } from '../config/kafka.js';

export const publishTransferEvent = async (transactionData, userEmail) => {
    try {
        const eventPayload = {
            transactionId: transactionData.id,
            amount: transactionData.amount,
            mode: transactionData.transfer_mode,
            status: transactionData.status,
            userEmail: userEmail,
            timestamp: new Date().toISOString()
        };

        await producer.send({
            topic: 'transfer-notifications', 
            messages: [
                {
                   
                    key: transactionData.id, 
                    value: JSON.stringify(eventPayload)
                }
            ]
        });

        console.log(`[KAFKA PRODUCER] Event published for TxID: ${transactionData.id}`);
    } catch (error) {

        console.error('[KAFKA PRODUCER ERROR] Failed to publish event:', error.message);
    }
};