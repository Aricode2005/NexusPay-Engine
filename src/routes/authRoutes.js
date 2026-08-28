import express from 'express';
import { signup, login } from '../controllers/authController.js';
import { loginLimiter } from '../middlewares/rateLimiter.js';

const router = express.Router();
router.post('/register', signup);
router.post('/login', loginLimiter, login);
export default router;

