import pool from '../config/db.js';
import { publishTransferEvent } from '../services/kafkaPublisher.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export const createTransferIntent = async (req, res) => {
    try {
        const { transferMethod, userHandle, receiverHandle, bankName, accountNumber, amount, remarks } = req.body;
        const senderId = req.user.id;

        if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount is required.' });

        const senderRes = await pool.query(
            `SELECT id, user_id, user_handle, account_number, bank_name, balance 
             FROM bank_accounts WHERE user_id = $1 AND user_handle = $2`,
            [senderId, userHandle]
        );

        if (senderRes.rows.length === 0) {
            return res.status(403).json({ error: 'You must link a primary bank account before sending money.' });
        }
        const senderAccount = senderRes.rows[0];

        let receiverAccount;
        if (transferMethod === 'HANDLE') {
            const resData = await pool.query(
                `SELECT id, user_id, user_handle, account_number, bank_name 
                 FROM bank_accounts WHERE user_handle = $1`, [receiverHandle]
            );
            receiverAccount = resData.rows[0];
            
        } else if (transferMethod === 'BANK_ACCOUNT') {
            const resData = await pool.query(
                `SELECT id, user_id, user_handle, account_number, bank_name 
                 FROM bank_accounts WHERE account_number = $1 AND bank_name = $2`, 
                 [accountNumber, bankName]
            );
            receiverAccount = resData.rows[0];
        } else {
            return res.status(400).json({ error: 'Invalid transfer method. Use HANDLE or BANK_ACCOUNT.' });
        }

        if (!receiverAccount) return res.status(404).json({ error: 'Receiver not found.' });
        if (senderAccount.id === receiverAccount.id) return res.status(400).json({ error: 'Cannot send to yourself.' });

        const orderId = `ORD_${crypto.randomUUID()}`;

        
        const intentRecord = await pool.query(
            `INSERT INTO transactions 
            (order_id, status, sender_id, sender_handle, sender_bank_name, sender_account_no, 
             receiver_id, receiver_handle, receiver_bank_name, receiver_account_no, amount) 
             VALUES ($1, 'PENDING', $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [
                orderId, 
                senderAccount.user_id, senderAccount.user_handle, senderAccount.bank_name, senderAccount.account_number,
                receiverAccount.user_id, receiverAccount.user_handle, receiverAccount.bank_name, receiverAccount.account_number,
                amount
            ]
        );

        res.status(200).json({
            message: 'Transfer intent created. Proceed to PIN verification.',
            order_id: orderId,
            transaction: intentRecord.rows[0]
        });

    } catch (error) {
        console.error('Intent Error:', error.message);
        res.status(500).json({ error: 'Failed to create transfer intent.' });
    }
};


export const executeTransfer = async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { order_id, mpin } = req.body;
        const senderUserId = req.user.id;

        if (!order_id || !mpin) return res.status(400).json({ error: 'order_id and mpin are required' });

        const userRes = await client.query('SELECT mpin FROM users WHERE id = $1', [senderUserId]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found.' });

        const storedMpin = userRes.rows[0].mpin;
        if (mpin!==storedMpin) {
            return res.status(401).json({ error: 'Invalid MPIN. Transaction authorization failed.' });
        }

        await client.query('BEGIN');

        const txnRes = await client.query('SELECT * FROM transactions WHERE order_id = $1 FOR UPDATE', [order_id]);
        if (txnRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Order not found' });
        }

        const transaction = txnRes.rows[0];

        if (transaction.status === 'SUCCESS') {
            await client.query('ROLLBACK');
            return res.status(200).json({ message: 'Transaction already completed successfully.', transaction });
        }
        if (transaction.status === 'FAILED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'This order previously failed and cannot be retried.' });
        }

        const senderAccRes = await client.query('SELECT id, balance FROM bank_accounts WHERE user_id = $1 AND user_handle = $2', [transaction.sender_id, transaction.sender_handle]);
        const receiverAccRes = await client.query('SELECT id FROM bank_accounts WHERE user_id = $1 AND user_handle = $2', [transaction.receiver_id, transaction.receiver_handle]);
        
        const sAccId = senderAccRes.rows[0].id;
        const rAccId = receiverAccRes.rows[0].id;

        const [firstLockId, secondLockId] = [sAccId, rAccId].sort();
        
        await client.query('SELECT balance FROM bank_accounts WHERE id = $1 FOR UPDATE', [firstLockId]);
        await client.query('SELECT balance FROM bank_accounts WHERE id = $1 FOR UPDATE', [secondLockId]);

        // 4. CHECK BALANCE
        if (parseFloat(senderAccRes.rows[0].balance) < parseFloat(transaction.amount)) {
            await client.query("UPDATE transactions SET status = 'FAILED' WHERE id = $1", [transaction.id]);
            await client.query('COMMIT'); 
            return res.status(400).json({ error: 'Insufficient funds.' });
        }

        await client.query('UPDATE bank_accounts SET balance = balance - $1 WHERE id = $2', [transaction.amount, sAccId]);
        await client.query('UPDATE bank_accounts SET balance = balance + $1 WHERE id = $2', [transaction.amount, rAccId]);

        const finalTxn = await client.query("UPDATE transactions SET status = 'SUCCESS' WHERE id = $1 RETURNING *", [transaction.id]);
        await client.query('COMMIT');

        const senderUserEmailRes = await client.query('SELECT email FROM users WHERE id = $1', [transaction.sender_id]);
        const receiverUserEmailRes = await client.query('SELECT email FROM users WHERE id = $1', [transaction.receiver_id]);
        
        const kafkaPayload = {
            txId: transaction.id,
            amount: transaction.amount,
            sender: { email: senderUserEmailRes.rows[0]?.email, handle: transaction.sender_handle },
            receiver: { email: receiverUserEmailRes.rows[0]?.email, handle: transaction.receiver_handle },
            timestamp: new Date().toISOString()
        };

        await publishTransferEvent(kafkaPayload);

        res.status(200).json({
            message: 'Transfer successful via MPIN authorization.',
            transaction: finalTxn.rows[0]
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Execute Error:', error.message);
        res.status(500).json({ error: 'Internal server error during transaction.' });
    } finally {
        client.release();
    }
};


export const getTransactionHistory = async (req, res) => {
    try {
        const userId = req.user.id; 

        const query = `
            SELECT * FROM transactions 
            WHERE sender_id = $1 OR receiver_id = $1 
            ORDER BY timestamp DESC; 
        `;

        const { rows } = await pool.query(query, [userId]);

        const formattedHistory = rows.map(txn => {
            let transactionType = '';

            if (txn.sender_id === userId && txn.receiver_id === userId) {
                transactionType = 'SELF'; 
            } else if (txn.sender_id === userId) {
                transactionType = 'DEBIT';
            } else {
                transactionType = 'CREDIT'; 
            }

            return {
                ...txn,
                transactionType 
            };
        });

        res.status(200).json({
            success: true,
            count: formattedHistory.length,
            data: formattedHistory
        });

    } catch (error) {
        console.error("History Error:", error);
        res.status(500).json({ error: "Failed to retrieve transaction history" });
    }
};