import express from 'express';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { transferLimiter } from '../middlewares/rateLimiter.js'; 

import { 
    createTransferIntent, 
    executeTransfer, 
    getTransactionHistory,
    getFraudStatus
} from '../controllers/transactionController.js';

const router = express.Router();

router.post('/intent', authenticateToken, transferLimiter, createTransferIntent);

router.post('/execute', authenticateToken, transferLimiter, executeTransfer);
router.get('/history', authenticateToken, getTransactionHistory);
router.get('/fraud/status', authenticateToken, getFraudStatus);

export default router;