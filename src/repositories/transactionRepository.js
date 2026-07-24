import pool from '../config/db.js';

export const executeTransfer = async (senderUserId, payload, idempotencyKey) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN'); 

        const idempCheck = await client.query(
            'SELECT * FROM transactions WHERE idempotency_key = $1',
            [idempotencyKey]
        );
        if (idempCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return { status: 'DUPLICATE', transaction: idempCheck.rows[0] };
        }

        const senderRes = await client.query(`
            SELECT ba.id, ba.balance 
            FROM bank_accounts ba
            JOIN user_handles uh ON ba.id = uh.account_id
            WHERE uh.user_id = $1 AND uh.is_primary = true
            FOR UPDATE
        `, [senderUserId]);

        if (senderRes.rows.length === 0) throw new Error('Sender primary account not found.');
        const senderAccount = senderRes.rows[0];

        if (senderAccount.balance < payload.amount) throw new Error('Insufficient funds.');

        let receiverAccountId;
        let receiverHandleUsed = null;

        if (payload.transferMode === 'UPI') {
            const receiverRes = await client.query(`
                SELECT account_id FROM user_handles WHERE handle_name = $1
            `, [payload.receiverHandle]);
            
            if (receiverRes.rows.length === 0) throw new Error('Receiver handle not found.');
            receiverAccountId = receiverRes.rows[0].account_id;
            receiverHandleUsed = payload.receiverHandle;

        } else if (payload.transferMode === 'IMPS' || payload.transferMode === 'NEFT') {
            const receiverRes = await client.query(`
                SELECT ba.id 
                FROM bank_accounts ba
                JOIN banks b ON ba.bank_id = b.id
                WHERE ba.account_number = $1 AND b.ifsc_code = $2
            `, [payload.receiverAccountNumber, payload.receiverBankIfsc]);
            
            if (receiverRes.rows.length === 0) throw new Error('Receiver bank account not found.');
            receiverAccountId = receiverRes.rows[0].id;
        }

        if (senderAccount.id === receiverAccountId) throw new Error('Cannot transfer to self.');

        await client.query('SELECT id FROM bank_accounts WHERE id = $1 FOR UPDATE', [receiverAccountId]);

        await client.query('UPDATE bank_accounts SET balance = balance - $1 WHERE id = $2', [payload.amount, senderAccount.id]);
        await client.query('UPDATE bank_accounts SET balance = balance + $1 WHERE id = $2', [payload.amount, receiverAccountId]);

        const txRes = await client.query(`
            INSERT INTO transactions 
            (sender_account_id, receiver_account_id, transfer_mode, receiver_handle_used, amount, status, idempotency_key)
            VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6) 
            RETURNING *;
        `, [
            senderAccount.id, 
            receiverAccountId, 
            payload.transferMode, 
            receiverHandleUsed, 
            payload.amount, 
            idempotencyKey
        ]);

        await client.query('COMMIT');
        return { status: 'SUCCESS', transaction: txRes.rows[0] };

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const getTransactionHistory = async (userId, limit = 10, offset = 0) => {
    const accountRes = await pool.query(`
        SELECT account_id FROM user_handles 
        WHERE user_id = $1 AND is_primary = true
    `, [userId]);

    if (accountRes.rows.length === 0) return [];
    const accountId = accountRes.rows[0].account_id;

    const query = `
        SELECT 
            id, 
            transfer_mode, 
            amount, 
            status, 
            created_at,
            CASE 
                WHEN sender_account_id = $2 THEN 'DEBIT'
                ELSE 'CREDIT' 
            END as transaction_type
        FROM transactions
        WHERE sender_account_id = $2 OR receiver_account_id = $2
        ORDER BY created_at DESC
        LIMIT $3 OFFSET $4;
    `;
    
    const result = await pool.query(query, [userId, accountId, limit, offset]);
    return result.rows;
};