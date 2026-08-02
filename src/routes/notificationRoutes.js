import express from 'express';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { getUserNotifications } from '../controllers/notificationController.js';

const router = express.Router();


router.get('/', authenticateToken, getUserNotifications);

export default router;