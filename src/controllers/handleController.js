import pool from '../config/db.js';

export const createHandle = async (req, res) => {
    try {
        const { handle, bankName, accountNumber, ifscCode, branch } = req.body;
        const userId = req.user.id; 

        const handleCheck = await pool.query(
            'SELECT user_handle FROM bank_accounts WHERE user_handle = $1', 
            [handle]
        );
        if (handleCheck.rows.length > 0) return res.status(400).json({ error: 'This handle is already taken.' });

        const bankCheck = await pool.query(
            'SELECT id FROM banks WHERE bank_name = $1',
            [bankName]
        );
        
        if (bankCheck.rows.length === 0) {
            return res.status(400).json({ error: `Bank '${bankName}' is not supported.` });
        }
        
        const bankId = bankCheck.rows[0].id;

        const countResult = await pool.query(
            'SELECT COUNT(*) FROM bank_accounts WHERE user_id = $1',
            [userId]
        );
        const isPrimary = (parseInt(countResult.rows[0].count) === 0);

        const newBankAccount = await pool.query(
            `INSERT INTO bank_accounts 
            (user_id, user_handle, bank_id, bank_name, account_number, ifsc_code, branch, balance, is_primary) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
             RETURNING id, user_handle, bank_name, balance, is_primary`,
            [userId, handle, bankId, bankName, accountNumber, ifscCode, branch, 10000.00, isPrimary]
        );

        res.status(201).json({
            message: 'Bank account successfully linked and handle generated.',
            data: newBankAccount.rows[0]
        });

    } catch (error) {
        console.error('Create Bank Account Error:', error.message);
        res.status(500).json({ error: 'Internal server error while linking bank account.' });
    }
};

export const getAllHandles = async (req, res) => {
    try {
        const userId = req.user.id;

        const result = await pool.query(
            `SELECT ba.id, ba.user_handle, b.bank_name, ba.account_number, ba.ifsc_code, ba.branch, ba.balance, ba.is_primary, ba.created_at 
             FROM bank_accounts ba 
             JOIN banks b ON ba.bank_id = b.id 
             WHERE ba.user_id = $1 
             ORDER BY ba.is_primary DESC, ba.created_at ASC`,
            [userId]
        );

        res.status(200).json({
            message: 'Bank accounts retrieved successfully.',
            total: result.rowCount,
            handles: result.rows
        });
    } catch (error) {
        console.error('Get Handles Error:', error.message);
        res.status(500).json({ error: 'Internal server error while fetching handles.' });
    }
};

export const setPrimaryHandle = async (req, res) => {
    const client = await pool.connect();
    try {
        const { handleId } = req.body;
        const userId = req.user.id;

        if (!handleId) {
            return res.status(400).json({ error: 'handleId is required.' });
        }

        await client.query('BEGIN'); 

        await client.query(
            'UPDATE bank_accounts SET is_primary = FALSE WHERE user_id = $1',
            [userId]
        );

        const updateRes = await client.query(
            `UPDATE bank_accounts SET is_primary = TRUE 
             WHERE id = $1 AND user_id = $2 
             RETURNING id, user_handle, is_primary`,
            [handleId, userId]
        );
     
        if (updateRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Handle not found or does not belong to you.' });
        }
    
        await client.query('COMMIT'); 

        res.status(200).json({
            message: `Successfully set ${updateRes.rows[0].user_handle} as your primary receiving account.`,
            primaryHandle: updateRes.rows[0]
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Set Primary Handle Error:', error.message);
        res.status(500).json({ error: 'Internal server error while updating primary handle.' });
    } finally {
        client.release();
    }
};