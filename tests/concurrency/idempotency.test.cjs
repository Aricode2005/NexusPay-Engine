/**
 * TEST 3: Idempotency
 * ====================
 * 
 * Scenario:
 *   Account A has ₹10,000. We send the same transfer request
 *   20 times in parallel, all with the SAME idempotency key.
 * 
 * Expected:
 *   - Exactly 1 debit happens
 *   - Balance decreases by exactly ₹100 (the transfer amount)
 *   - 19 of the responses return the original transaction (deduplicated: true)
 *   - The same order_id is returned for all 20 responses
 * 
 * Why this matters:
 *   Network retries, user double-clicks, or mobile app glitches can send
 *   the same request multiple times. Without idempotency, each would create
 *   a separate transfer. NexusPay uses an idempotency_key column with a
 *   UNIQUE constraint + application-level check to guarantee at-most-once.
 * 
 * PREREQUISITE:
 *   The transactions table must have an `idempotency_key` column:
 *     ALTER TABLE transactions ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE;
 */

const {
    pool,
    login,
    createIntent,
    getBalance,
    setBalance,
    seedTestData,
    cleanupTestTransactions,
} = require('./helpers.cjs');

const PARALLEL_REQUESTS = 20;
const TRANSFER_AMOUNT = 100;
const INITIAL_BALANCE = 10000;

describe('Test 3 — Idempotency', () => {
    let senderToken;
    let senderHandle;
    let receiverHandle;

    beforeAll(async () => {
        const users = await seedTestData({
            senderCount: 1,
            receiverCount: 1,
            senderBalance: INITIAL_BALANCE,
            receiverBalance: 0,
        });

        const sender = users.find(u => u.role === 'sender');
        const receiver = users.find(u => u.role === 'receiver');
        senderHandle = sender.handle;
        receiverHandle = receiver.handle;

        senderToken = await login(sender.email, 'LoadTest123!');
    });

    afterAll(async () => {
        await cleanupTestTransactions();
        await pool.end();
    });

    test(`sends ${PARALLEL_REQUESTS} identical requests with the same idempotency key — exactly 1 intent is created`, async () => {
        const idempotencyKey = `idem_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        const startBalance = await getBalance(senderHandle);
        console.log(`\n Starting balance: ₹${startBalance}`);
        console.log(` Idempotency key: ${idempotencyKey}`);

        console.log(`\n Firing ${PARALLEL_REQUESTS} identical intent requests...`);

        const promises = Array.from({ length: PARALLEL_REQUESTS }, () =>
            createIntent(senderToken, senderHandle, receiverHandle, TRANSFER_AMOUNT, {
                idempotencyKey,
            })
        );

        const results = await Promise.all(promises);

        const statusCodes = results.map(r => r.status);
        const success200 = results.filter(r => r.status === 200);
        const deduplicated = results.filter(r => r.body.deduplicated === true);
        const original = results.filter(r => r.status === 200 && !r.body.deduplicated);

        console.log(`\n Results:`);
        console.log(`   Total 200 responses:  ${success200.length}`);
        console.log(`   Original (new):       ${original.length}`);
        console.log(`   Deduplicated:         ${deduplicated.length}`);

        const orderIds = [...new Set(success200.map(r => r.body.order_id))];
        console.log(`   Unique order_ids:     ${orderIds.length} → ${orderIds[0]}`);

        const dbCheck = await pool.query(
            'SELECT COUNT(*) as cnt FROM transactions WHERE idempotency_key = $1',
            [idempotencyKey]
        );
        const dbCount = parseInt(dbCheck.rows[0].cnt);
        console.log(`   Rows in DB:           ${dbCount}`);

        expect(success200.length).toBe(PARALLEL_REQUESTS); 
        expect(dbCount).toBe(1); 
        expect(orderIds.length).toBe(1); 

        expect(deduplicated.length).toBe(PARALLEL_REQUESTS - 1);
        expect(original.length).toBe(1);

        const intentCount = await pool.query(
            `SELECT COUNT(*) as cnt FROM transactions 
             WHERE sender_handle = $1 AND receiver_handle = $2 AND amount = $3 
             AND idempotency_key = $4`,
            [senderHandle, receiverHandle, TRANSFER_AMOUNT, idempotencyKey]
        );
        expect(parseInt(intentCount.rows[0].cnt)).toBe(1);

        console.log(`\n PASS: Exactly 1 transaction created despite ${PARALLEL_REQUESTS} parallel requests.`);
    });
});
