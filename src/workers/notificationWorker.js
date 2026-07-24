import { consumer } from './config/kafka.js';

const runNotificationWorker = async () => {
    await consumer.subscribe({ topic: 'transfer-notifications', fromBeginning: true });

    await consumer.run({
       eachMessage: async ({ message }) => {
    const event = JSON.parse(message.value.toString());
    const { sender, receiver, amount, txId } = event;

    console.log(`[NOTIFICATION WORKER] Processing Transaction: ${txId}`);

    if (sender.email) {
        await sendEmail(
            sender.email, 
            'Debit Notification', 
            `Your account ${sender.handle} was debited by ${amount} Rupees. TxID: ${txId}`
        );
    }

    if (receiver.email) {
        await sendEmail(
            receiver.email, 
            'Credit Notification', 
            `Your account ${receiver.handle} was credited with ${amount} Rupees. TxID: ${txId}`
        );
    }
},
    });
};

runNotificationWorker().catch(console.error);


const shutdown = async () => {
    console.log('\n Shutting down gracefully... Please wait.');
    try {
        await consumer.disconnect();
        console.log('Kafka Consumer disconnected successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error during Kafka shutdown:', error);
        process.exit(1);
    }
};


process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);