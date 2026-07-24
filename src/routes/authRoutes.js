import express from 'express';
import { loginLimiter } from '../middlewares/rateLimiter.js';
import { signup, login } from '../controllers/authController.js';
const router = express.Router();
router.post('/register', signup);
router.post('/login',login);
export default router;

