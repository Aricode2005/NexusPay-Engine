import express from 'express';
import { createHandle, getAllHandles, setPrimaryHandle } from '../controllers/handleController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/', authenticateToken, createHandle);

router.get('/', authenticateToken, getAllHandles);

router.put('/set-primary', authenticateToken, setPrimaryHandle);

export default router;