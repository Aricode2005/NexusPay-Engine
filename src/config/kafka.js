import { Kafka, Partitioners } from 'kafkajs';
export const kafka = new Kafka({
    clientId: 'wallet-app',
    brokers: ['localhost:9092'],
    retry: {
        initialRetryTime: 1000, 
        retries: 8              
    }
});
const producer = kafka.producer({ 
    createPartitioner: Partitioners.LegacyPartitioner 
});

export const consumer = kafka.consumer({ groupId: 'notification-group' });

export const connectKafka = async () => {
    try {
        await producer.connect();
        console.log('Successfully connected to Kafka Producer');
        
        await consumer.connect();
        console.log('Successfully connected to Kafka Consumer');
    } catch (error) {
        console.error('Kafka Connection Error:', error);
    }
};
export const createTopic = async () => {
    const admin = kafka.admin();
    await admin.connect();
    
    await admin.createTopics({
        topics: [{
            topic: 'transfer-notifications',
            numPartitions: 3,
            replicationFactor: 1
        }],
    });
    
    await admin.disconnect();
    console.log('Topic "transfer-notifications" created successfully.');
};

export const sendKafkaEvent = async (topic, eventMessage) => {
    try {
        await producer.send({
            topic: topic,
            messages: [
                { 
                    value: JSON.stringify(eventMessage) 
                }
            ],
        });
        console.log(`Sent event to Kafka topic [${topic}]`);
    } catch (error) {
        console.error(`Failed to send Kafka event to [${topic}]:`, error.message);
    }
};