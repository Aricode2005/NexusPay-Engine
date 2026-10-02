/**
 * TEST 1: Double-Spend Prevention
 * ================================
 * 
 * Scenario:
 *   Account A has ₹100. We fire 50 simultaneous transfers of ₹10 each
 *   to 50 different receiver accounts.
 * 
 * Expected:
 *   - Exactly 10 transfers succeed (100 / 10 = 10)
 *   - Sender balance ends at ₹0
 *   - Balance NEVER goes negative
 *   - 40 transfers fail with "Insufficient funds"
 * 
 * Why this matters:
 *   Without proper row-level locking (SELECT ... FOR UPDATE), concurrent
 *   transfers could all read balance=100 before any debit happens, causing
 *   double-spends. NexusPay uses PostgreSQL advisory locks + FOR UPDATE
 *   to prevent this.
 */

const {
    pool,
    login,
    createIntent,
    executeTransfer,
    getBalance,
    setBalance,
    seedTestData,
    cleanupTestTransactions,
} = require('./helpers.cjs');

const CONCURRENT_TRANSFERS = 50;
const TRANSFER_AMOUNT = 10;
const SENDER_BALANCE = 100;

describe('Test 1 — Double-Spend Prevention', () => {
    let senderToken;
    let senderHandle;
    let receiverHandles = [];

    beforeAll(async () => {
        const users = await seedTestData({
            senderCount: 1,
            receiverCount: CONCURRENT_TRANSFERS,
            senderBalance: SENDER_BALANCE,
            receiverBalance: 0,
        });

        const sender = users.find(u => u.role === 'sender');
        senderHandle = sender.handle;
        receiverHandles = users.filter(u => u.role === 'receiver').map(u => u.handle);

        senderToken = await login(sender.email, 'LoadTest123!');
    });

    afterAll(async () => {
        await cleanupTestTransactions();
        await pool.end();
    });

    test(`fires ${CONCURRENT_TRANSFERS} concurrent ₹${TRANSFER_AMOUNT} transfers — exactly ${SENDER_BALANCE / TRANSFER_AMOUNT} succeed, balance ends at 0, never goes negative`, async () => {
        console.log(`\nCreating ${CONCURRENT_TRANSFERS} transfer intents...`);
        
        const intentPromises = receiverHandles.map((receiverHandle) =>
            createIntent(senderToken, senderHandle, receiverHandle, TRANSFER_AMOUNT)
        );
        const intentResults = await Promise.all(intentPromises);

        const validIntents = intentResults.filter(r => r.status === 200 && r.body.order_id);
        console.log(` ${validIntents.length} intents created successfully`);
        expect(validIntents.length).toBe(CONCURRENT_TRANSFERS);

        console.log(`\n Firing ${validIntents.length} concurrent executions...`);
        
        const executePromises = validIntents.map((intent) =>
            executeTransfer(senderToken, intent.body.order_id, '1234')
        );
        const executeResults = await Promise.all(executePromises);

        const successes = executeResults.filter(r => r.status === 200 && r.body.transaction?.status === 'SUCCESS');
        const insufficientFunds = executeResults.filter(r => r.status === 400 && r.body.error === 'Insufficient funds.');
        const otherErrors = executeResults.filter(r => r.status !== 200 && r.status !== 400);

        console.log(`\n   Results:`);
        console.log(`     Successful transfers: ${successes.length}`);
        console.log(`     Insufficient funds:   ${insufficientFunds.length}`);
        console.log(`     Other errors:         ${otherErrors.length}`);
        if (otherErrors.length > 0) {
            otherErrors.forEach(r => console.log(`      → status ${r.status}: ${JSON.stringify(r.body)}`));
        }

        const finalBalance = await getBalance(senderHandle);
        console.log(`\n Final sender balance: ₹${finalBalance}`);

        expect(successes.length).toBe(SENDER_BALANCE / TRANSFER_AMOUNT); 
        expect(finalBalance).toBe(0);
        expect(finalBalance).toBeGreaterThanOrEqual(0); 
        expect(insufficientFunds.length).toBe(CONCURRENT_TRANSFERS - (SENDER_BALANCE / TRANSFER_AMOUNT));

        console.log(`\nPASS: Zero double-spends detected. ${successes.length} of ${CONCURRENT_TRANSFERS} transfers succeeded.`);
    });
});
