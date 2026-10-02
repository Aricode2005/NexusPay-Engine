/**
 * TEST 2: Deadlock Prevention
 * ============================
 * 
 * Scenario:
 *   Account A and Account B each have ₹10,000.
 *   We simultaneously fire:
 *     - A → B transfers (₹10 each)
 *     - B → A transfers (₹10 each)
 *   
 *   We run 100 pairs (200 total transfers) concurrently.
 * 
 * Expected:
 *   - No requests hang or timeout (deadlock would cause this)
 *   - Total money across both accounts is unchanged (₹20,000)
 *   - All transfers either succeed or fail gracefully
 * 
 * Why this matters:
 *   A classic deadlock scenario: Transaction 1 locks A then tries to lock B,
 *   while Transaction 2 locks B then tries to lock A → both wait forever.
 *   NexusPay prevents this by always locking accounts in a deterministic order
 *   (by account ID, ascending): `[firstLockId, secondLockId] = [sAccId, rAccId].sort()`
 */

const {
    pool,
    login,
    fullTransfer,
    getBalance,
    getTotalBalance,
    seedTestData,
    cleanupTestTransactions,
} = require('./helpers.cjs');

const PAIRS = 100;
const TRANSFER_AMOUNT = 10;
const INITIAL_BALANCE = 10000;
const TIMEOUT_MS = 60000; 

describe('Test 2 — Deadlock Prevention', () => {
    let tokenA, tokenB;
    let handleA, handleB;

    beforeAll(async () => {
        const users = await seedTestData({
            senderCount: 2,
            receiverCount: 0,
            senderBalance: INITIAL_BALANCE,
            receiverBalance: 0,
        });

        const senders = users.filter(u => u.role === 'sender');
        handleA = senders[0].handle;
        handleB = senders[1].handle;

        tokenA = await login(senders[0].email, 'LoadTest123!');
        tokenB = await login(senders[1].email, 'LoadTest123!');
    });

    afterAll(async () => {
        await cleanupTestTransactions();
        await pool.end();
    });

    test(`${PAIRS * 2} concurrent cross-transfers (A↔B) complete without deadlock, total money unchanged`, async () => {
        const expectedTotal = INITIAL_BALANCE * 2; // ₹20,000

        const startTotal = await getTotalBalance([handleA, handleB]);
        console.log(`\n Starting total: ₹${startTotal} (A + B)`);
        expect(startTotal).toBe(expectedTotal);

        console.log(`\n Firing ${PAIRS * 2} concurrent cross-transfers...`);
        const startTime = Date.now();

        const promises = [];
        for (let i = 0; i < PAIRS; i++) {
            promises.push(
                fullTransfer(tokenA, handleA, handleB, TRANSFER_AMOUNT, '1234')
            );
            promises.push(
                fullTransfer(tokenB, handleB, handleA, TRANSFER_AMOUNT, '1234')
            );
        }

        const results = await Promise.race([
            Promise.all(promises),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('DEADLOCK DETECTED — requests timed out after 60s')), TIMEOUT_MS)
            ),
        ]);

        const elapsed = Date.now() - startTime;
        console.log(`\n  All ${results.length} transfers completed in ${elapsed}ms`);

        const aToBResults = results.filter((_, i) => i % 2 === 0);
        const bToAResults = results.filter((_, i) => i % 2 === 1);

        const aToBSuccess = aToBResults.filter(r => r.executeRes?.status === 200).length;
        const bToASuccess = bToAResults.filter(r => r.executeRes?.status === 200).length;
        const aToBFailed = aToBResults.filter(r => r.executeRes?.status === 400).length;
        const bToAFailed = bToAResults.filter(r => r.executeRes?.status === 400).length;

        console.log(`\n Results:`);
        console.log(`   A→B: ${aToBSuccess} success, ${aToBFailed} insufficient funds`);
        console.log(`   B→A: ${bToASuccess} success, ${bToAFailed} insufficient funds`);

        expect(results.length).toBe(PAIRS * 2);

        const finalBalanceA = await getBalance(handleA);
        const finalBalanceB = await getBalance(handleB);
        const finalTotal = finalBalanceA + finalBalanceB;

        console.log(`\n Final balances:`);
        console.log(`   A: ₹${finalBalanceA}`);
        console.log(`   B: ₹${finalBalanceB}`);
        console.log(`   Total: ₹${finalTotal}`);

        expect(finalTotal).toBe(expectedTotal); 
        expect(finalBalanceA).toBeGreaterThanOrEqual(0);
        expect(finalBalanceB).toBeGreaterThanOrEqual(0);
        expect(elapsed).toBeLessThan(TIMEOUT_MS); 

        console.log(`\n PASS: No deadlocks. Total money conserved at ₹${finalTotal}. Completed in ${elapsed}ms.`);
    });
});
