import 'dotenv/config';
import express from 'express';
import pool from './src/config/db.js';
import authRoutes from './src/routes/authRoutes.js'; 
import transactionRoutes from './src/routes/transactionRoutes.js';
import { connectKafka, createTopic } from './src/config/kafka.js';
import { connectRedis } from './src/config/redis.js';
import handleRoutes from './src/routes/handleRoutes.js';
import swaggerUi from 'swagger-ui-express'; 
import fs from 'fs';
import path from 'path'


await connectKafka();
await createTopic();


const app = express();
const PORT = process.env.PORT || 3000;

const swaggerDocument = JSON.parse(fs.readFileSync(path.resolve('./src/swagger.json'), 'utf8'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use(express.json());

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/handles', handleRoutes);
app.use('/api/v1/transactions', transactionRoutes);

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Wallet Backend is running seamlessly.' });
});
await connectRedis();
startSweeperJob();
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
