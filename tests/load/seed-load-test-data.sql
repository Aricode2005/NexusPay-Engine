-- =============================================================================
-- NexusPay Seed Load Test Data
-- 
-- Description:
-- Seeds test entities for k6 load testing and performance benchmarks:
-- 1. 'Test Bank' in banks table
-- 2. 52 test users:
--    - 26 sender users: loadtest_a@nexuspay.test through loadtest_z@nexuspay.test
--    - 26 receiver users: loadtest_recv_1@nexuspay.test through loadtest_recv_26@nexuspay.test
--    - Credentials: password='LoadTest123!' (bcrypt hash), mpin='1234'
-- 3. 52 bank_accounts:
--    - Handles: loadtest_a@nexus .. loadtest_z@nexus, loadtest_recv_1@nexus .. loadtest_recv_26@nexus
--    - Initial balance: ₹100,000.00 each
-- 4. Idempotent: Uses ON CONFLICT DO NOTHING everywhere
-- 5. Resets account balances to 100000.00 and unfreezes accounts upon re-execution
-- =============================================================================

BEGIN;

-- 1. Insert 'Test Bank'
INSERT INTO banks (bank_name, is_active)
VALUES ('Test Bank', true)
ON CONFLICT DO NOTHING;

-- 2. Insert 26 Sender Users (loadtest_a through loadtest_z)
INSERT INTO users (
    full_name,
    email,
    phone,
    aadhar_number,
    password_hash,
    mpin,
    account_frozen
)
SELECT
    'Load Test User ' || UPPER(chr(i)),
    'loadtest_' || chr(i) || '@nexuspay.test',
    LPAD(FLOOR(RANDOM() * 9000000000 + 1000000000)::BIGINT::TEXT, 10, '0'),
    LPAD(FLOOR(RANDOM() * 900000000000 + 100000000000)::BIGINT::TEXT, 12, '0'),
    '$2b$10$f6DFvK6fvuYmgiWCQBmwDeH7LWd.52I0oJjIGndVdBkRHL0v4kv.K',
    '1234',
    false
FROM generate_series(97, 122) AS i
ON CONFLICT DO NOTHING;

-- 3. Insert 26 Receiver Users (loadtest_recv_1 through loadtest_recv_26)
INSERT INTO users (
    full_name,
    email,
    phone,
    aadhar_number,
    password_hash,
    mpin,
    account_frozen
)
SELECT
    'Load Test Receiver ' || i,
    'loadtest_recv_' || i || '@nexuspay.test',
    LPAD(FLOOR(RANDOM() * 9000000000 + 1000000000)::BIGINT::TEXT, 10, '0'),
    LPAD(FLOOR(RANDOM() * 900000000000 + 100000000000)::BIGINT::TEXT, 12, '0'),
    '$2b$10$f6DFvK6fvuYmgiWCQBmwDeH7LWd.52I0oJjIGndVdBkRHL0v4kv.K',
    '1234',
    false
FROM generate_series(1, 26) AS i
ON CONFLICT DO NOTHING;

-- 4. Insert Bank Accounts for Sender Users (loadtest_a@nexus through loadtest_z@nexus)
INSERT INTO bank_accounts (
    user_id,
    bank_id,
    bank_name,
    user_handle,
    account_number,
    ifsc_code,
    branch,
    balance,
    is_primary
)
SELECT
    u.id,
    b.id,
    b.bank_name,
    'loadtest_' || chr(i) || '@nexus',
    'TESTACC100' || LPAD((i - 96)::TEXT, 4, '0'),
    'TEST0001234',
    'Load Test Branch',
    100000.00,
    true
FROM generate_series(97, 122) AS i
JOIN users u ON u.email = 'loadtest_' || chr(i) || '@nexuspay.test'
CROSS JOIN (SELECT id, bank_name FROM banks WHERE bank_name = 'Test Bank' LIMIT 1) b
ON CONFLICT DO NOTHING;

-- 5. Insert Bank Accounts for Receiver Users (loadtest_recv_1@nexus through loadtest_recv_26@nexus)
INSERT INTO bank_accounts (
    user_id,
    bank_id,
    bank_name,
    user_handle,
    account_number,
    ifsc_code,
    branch,
    balance,
    is_primary
)
SELECT
    u.id,
    b.id,
    b.bank_name,
    'loadtest_recv_' || i || '@nexus',
    'TESTACC200' || LPAD(i::TEXT, 4, '0'),
    'TEST0001234',
    'Load Test Branch',
    100000.00,
    true
FROM generate_series(1, 26) AS i
JOIN users u ON u.email = 'loadtest_recv_' || i || '@nexuspay.test'
CROSS JOIN (SELECT id, bank_name FROM banks WHERE bank_name = 'Test Bank' LIMIT 1) b
ON CONFLICT DO NOTHING;

-- 6. Reset all load test account balances to 100,000.00
UPDATE bank_accounts
SET balance = 100000.00
WHERE user_handle LIKE 'loadtest_%@nexus';

-- 7. Reset frozen status in case accounts were locked during previous tests
UPDATE users
SET account_frozen = false, frozen_reason = NULL, frozen_at = NULL
WHERE email LIKE 'loadtest_%@nexuspay.test';

COMMIT;
