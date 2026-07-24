import { createClient } from 'redis';
const redisClient = createClient({
    url: 'redis://localhost:6379'
});
redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('Successfully connected to Redis Cache'));
export const connectRedis = async () => {
    try {
        await redisClient.connect();
    } catch (error) {
        console.error('Failed to connect to Redis:', error.message);
    }
};
export default redisClient;