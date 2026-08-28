import { consumer } from '../config/kafka.js';
import pool from '../config/db.js';
import { analyzeTransaction } from '../services/fraudAgentService.js';

const runNotificationWorker = async () => {
    await consumer.subscribe({ topic: 'transfer-notifications', fromBeginning: true });
    
    await consumer.run({
        eachMessage: async ({ message }) => {
            const event = JSON.parse(message.value.toString());
            const { sender, receiver, amount, txId } = event;

            console.log(`[NOTIFICATION WORKER] Processing receipt for TxID: ${txId}`);

            try {
                const senderRes = await pool.query('SELECT id FROM users WHERE email = $1', [sender.email]);
                const receiverRes = await pool.query('SELECT id FROM users WHERE email = $1', [receiver.email]);

                if (senderRes.rows.length > 0) {
                    const senderId = senderRes.rows[0].id;
                    await pool.query(
                        `INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)`,
                        [senderId, 'DEBIT', 'Money Sent', `You successfully sent ₹${amount} to ${receiver.handle}. TxID: ${txId}`]
                    );

                    analyzeTransaction(senderId, amount, txId, sender.handle, receiver.handle)
                        .catch((err) => console.error('[FRAUD AGENT] Async error:', err.message));

                } else {
                    console.warn(`[NOTIFICATION WORKER] Sender email ${sender.email} not found in DB.`);
                }

                if (receiverRes.rows.length > 0) {
                    const receiverId = receiverRes.rows[0].id;
                    await pool.query(
                        `INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)`,
                        [receiverId, 'CREDIT', 'Money Received', `You received ₹${amount} from ${sender.handle}. TxID: ${txId}`]
                    );
                } else {
                    console.warn(`[NOTIFICATION WORKER] Receiver email ${receiver.email} not found in DB.`);
                }

                console.log(`[NOTIFICATION WORKER] Successfully saved notifications for TxID: ${txId}`);

            } catch (dbError) {
                console.error('[NOTIFICATION WORKER] PostgreSQL Error:', dbError.message);
            }
        },
    });
};

runNotificationWorker().catch(console.error);

const shutdown = async () => {
    console.log('\n[WORKER] Shutting down gracefully... Please wait.');
    try {
        await consumer.disconnect();
        console.log('[WORKER] Kafka Consumer disconnected successfully.');
        process.exit(0);
    } catch (error) {
        console.error('[WORKER] Error during Kafka shutdown:', error);
        process.exit(1);
    }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);