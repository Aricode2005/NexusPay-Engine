import express from 'express';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { transferLimiter } from '../middlewares/rateLimiter.js'; 

import { 
    createTransferIntent, 
    executeTransfer, 
    getTransactionHistory 
} from '../controllers/transactionController.js';

const router = express.Router();

router.post('/intent', authenticateToken, transferLimiter, createTransferIntent);

router.post('/execute', authenticateToken, transferLimiter, executeTransfer);
router.get('/history', authenticateToken, getTransactionHistory);

export default router;