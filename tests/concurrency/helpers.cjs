/**
 * helpers.cjs — shared test utilities for the NexusPay concurrency test suite.
 * 
 * This module handles:
 *  - Direct PostgreSQL access for seeding/resetting test data
 *  - HTTP helpers to call the API (login, create intent, execute transfer)
 *  - Balance queries and cleanup
 */

const { Pool } = require('pg');
const http = require('http');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'Aritra@2005',
    database: process.env.DB_NAME || 'wallet_db',
});


const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function httpRequest(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const payload = body ? JSON.stringify(body) : null;

        const opts = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        };

        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}



async function login(email, password) {
    const res = await httpRequest('POST', '/api/v1/auth/login', { email, password });
    if (res.status !== 200) {
        throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
    }
    return res.body.token;
}



async function createIntent(token, senderHandle, receiverHandle, amount, extras = {}) {
    return httpRequest('POST', '/api/v1/transactions/intent', {
        transferMethod: 'HANDLE',
        userHandle: senderHandle,
        receiverHandle,
        amount,
        ...extras,
    }, token);
}

async function executeTransfer(token, orderId, mpin = '1234') {
    return httpRequest('POST', '/api/v1/transactions/execute', {
        order_id: orderId,
        mpin,
    }, token);
}


async function fullTransfer(token, senderHandle, receiverHandle, amount, mpin = '1234', extras = {}) {
    const intentRes = await createIntent(token, senderHandle, receiverHandle, amount, extras);
    if (intentRes.status !== 200 || !intentRes.body.order_id) {
        return { intentRes, executeRes: null };
    }
    const executeRes = await executeTransfer(token, intentRes.body.order_id, mpin);
    return { intentRes, executeRes };
}



async function getBalance(handle) {
    const res = await pool.query(
        'SELECT balance FROM bank_accounts WHERE user_handle = $1',
        [handle]
    );
    return res.rows.length > 0 ? parseFloat(res.rows[0].balance) : null;
}

async function setBalance(handle, amount) {
    await pool.query(
        'UPDATE bank_accounts SET balance = $1 WHERE user_handle = $2',
        [amount, handle]
    );
}

async function getTotalBalance(handles) {
    const res = await pool.query(
        'SELECT SUM(balance) as total FROM bank_accounts WHERE user_handle = ANY($1)',
        [handles]
    );
    return parseFloat(res.rows[0].total);
}

async function cleanupTestTransactions() {
    await pool.query(`
        DELETE FROM transactions 
        WHERE sender_handle LIKE 'conctest_%' OR receiver_handle LIKE 'conctest_%'
    `);
    await pool.query(`
        DELETE FROM notifications 
        WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'conctest_%@nexuspay.test')
    `);
}


async function seedTestData({ senderCount = 2, receiverCount = 20, senderBalance = 100, receiverBalance = 0 } = {}) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            INSERT INTO banks (bank_name) VALUES ('ConcTest Bank')
            ON CONFLICT DO NOTHING
        `);
        const bankRes = await client.query(`SELECT id FROM banks WHERE bank_name = 'ConcTest Bank'`);
        const bankId = bankRes.rows[0].id;

        const users = [];

        for (let i = 0; i < senderCount; i++) {
            const email = `conctest_sender_${i}@nexuspay.test`;
            const handle = `conctest_sender_${i}@nexus`;
            const phone = `90000${String(i).padStart(5, '0')}`;
            const aadhar = `900000${String(i).padStart(6, '0')}`;
            const acctNo = `CONC_S_${String(i).padStart(6, '0')}`;

            await client.query(`
                INSERT INTO users (full_name, email, phone, password_hash, aadhar_number, mpin, account_frozen)
                VALUES ($1, $2, $3, $4, $5, '1234', false)
                ON CONFLICT (email) DO UPDATE SET mpin = '1234', account_frozen = false
            `, [`ConcTest Sender ${i}`, email, phone,
                '$2b$10$f6DFvK6fvuYmgiWCQBmwDeH7LWd.52I0oJjIGndVdBkRHL0v4kv.K', aadhar]);

            const userRes = await client.query('SELECT id FROM users WHERE email = $1', [email]);
            const userId = userRes.rows[0].id;

            await client.query(`
                INSERT INTO bank_accounts (user_id, user_handle, bank_id, bank_name, account_number, ifsc_code, branch, balance, is_primary)
                VALUES ($1, $2, $3, 'ConcTest Bank', $4, 'CONC0000001', 'Test Branch', $5, true)
                ON CONFLICT (user_handle) DO UPDATE SET balance = $5
            `, [userId, handle, bankId, acctNo, senderBalance]);

            users.push({ email, handle, userId, role: 'sender' });
        }

        for (let i = 0; i < receiverCount; i++) {
            const email = `conctest_recv_${i}@nexuspay.test`;
            const handle = `conctest_recv_${i}@nexus`;
            const phone = `91000${String(i).padStart(5, '0')}`;
            const aadhar = `910000${String(i).padStart(6, '0')}`;
            const acctNo = `CONC_R_${String(i).padStart(6, '0')}`;

            await client.query(`
                INSERT INTO users (full_name, email, phone, password_hash, aadhar_number, mpin, account_frozen)
                VALUES ($1, $2, $3, $4, $5, '1234', false)
                ON CONFLICT (email) DO UPDATE SET mpin = '1234', account_frozen = false
            `, [`ConcTest Recv ${i}`, email, phone,
                '$2b$10$f6DFvK6fvuYmgiWCQBmwDeH7LWd.52I0oJjIGndVdBkRHL0v4kv.K', aadhar]);

            const userRes = await client.query('SELECT id FROM users WHERE email = $1', [email]);
            const userId = userRes.rows[0].id;

            await client.query(`
                INSERT INTO bank_accounts (user_id, user_handle, bank_id, bank_name, account_number, ifsc_code, branch, balance, is_primary)
                VALUES ($1, $2, $3, 'ConcTest Bank', $4, 'CONC0000001', 'Test Branch', $5, true)
                ON CONFLICT (user_handle) DO UPDATE SET balance = $5
            `, [userId, handle, bankId, acctNo, receiverBalance]);

            users.push({ email, handle, userId, role: 'receiver' });
        }

        await client.query('COMMIT');
        return users;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}



module.exports = {
    pool,
    httpRequest,
    login,
    createIntent,
    executeTransfer,
    fullTransfer,
    getBalance,
    setBalance,
    getTotalBalance,
    cleanupTestTransactions,
    seedTestData,
};
