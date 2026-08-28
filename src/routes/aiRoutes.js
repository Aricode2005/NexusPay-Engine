import express from 'express';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { queryRAG } from '../services/ragService.js';
import pool from '../config/db.js';

const router = express.Router();

router.get('/me', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const userRes = await pool.query(
            'SELECT id, full_name, email, phone FROM users WHERE id = $1',
            [userId]
        );
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const handlesRes = await pool.query(
            `SELECT ba.id, ba.user_handle, b.bank_name, ba.balance, ba.is_primary 
             FROM bank_accounts ba 
             JOIN banks b ON ba.bank_id = b.id 
             WHERE ba.user_id = $1 
             ORDER BY ba.is_primary DESC`,
            [userId]
        );

        const recentTxRes = await pool.query(
            `SELECT t.id, t.order_id, t.amount, t.status, t.sender_handle, t.receiver_handle, t.timestamp
             FROM transactions t
             WHERE t.sender_id = $1 OR t.receiver_id = $1
             ORDER BY t.timestamp DESC LIMIT 5`,
            [userId]
        );

        res.json({
            user: userRes.rows[0],
            handles: handlesRes.rows,
            recentTransactions: recentTxRes.rows
        });
    } catch (error) {
        console.error('Profile Error:', error);
        res.status(500).json({ error: 'Failed to load profile.' });
    }
});

router.post('/chat', authenticateToken, async (req, res) => {
    try {
        const { query } = req.body;
        const userId = req.user.id;
        const response = await queryRAG(query, userId);
        res.json({ answer: response });
    } catch (error) {
        console.error('Chat Error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
