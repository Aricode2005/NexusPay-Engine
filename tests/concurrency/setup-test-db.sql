
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS transactions_idempotency_key_key
ON transactions (idempotency_key) 
WHERE idempotency_key IS NOT NULL;

INSERT INTO banks (bank_name) VALUES ('ConcTest Bank')
ON CONFLICT DO NOTHING;


INSERT INTO users (full_name, email, phone, password_hash, aadhar_number, mpin, account_frozen)
VALUES 
    ('ConcTest Sender 0', 'conctest_sender_0@nexuspay.test', '9000000000', '$2b$10$f6DFvK6fvuYmgiWCQBmwDeH7LWd.52I0oJjIGndVdBkRHL0v4kv.K', '900000000000', '1234', false),
    ('ConcTest Sender 1', 'conctest_sender_1@nexuspay.test', '9000000001', '$2b$10$f6DFvK6fvuYmgiWCQBmwDeH7LWd.52I0oJjIGndVdBkRHL0v4kv.K', '900000000001', '1234', false)
ON CONFLICT (email) DO UPDATE SET mpin = '1234', account_frozen = false, password_hash = EXCLUDED.password_hash;

DO $$
DECLARE
    i INTEGER;
    v_email TEXT;
    v_phone TEXT;
    v_aadhar TEXT;
BEGIN
    FOR i IN 0..49 LOOP
        v_email := 'conctest_recv_' || i || '@nexuspay.test';
        v_phone := '91000' || LPAD(i::TEXT, 5, '0');
        v_aadhar := '910000' || LPAD(i::TEXT, 6, '0');
        
        INSERT INTO users (full_name, email, phone, password_hash, aadhar_number, mpin, account_frozen)
        VALUES (
            'ConcTest Recv ' || i,
            v_email, v_phone,
            '$2b$10$f6DFvK6fvuYmgiWCQBmwDeH7LWd.52I0oJjIGndVdBkRHL0v4kv.K',
            v_aadhar, '1234', false
        )
        ON CONFLICT (email) DO UPDATE SET mpin = '1234', account_frozen = false, password_hash = EXCLUDED.password_hash;
    END LOOP;
END $$;

DO $$
DECLARE
    v_user RECORD;
    v_handle TEXT;
    v_acct_no TEXT;
    v_bank_id INTEGER;
    v_balance NUMERIC;
BEGIN
    SELECT id INTO v_bank_id FROM banks WHERE bank_name = 'ConcTest Bank';
    
    FOR v_user IN 
        SELECT id, email FROM users WHERE email LIKE 'conctest_%@nexuspay.test'
    LOOP
        v_handle := REPLACE(SPLIT_PART(v_user.email, '@', 1), '.', '_') || '@nexus';
        v_acct_no := 'CONC_' || v_user.id;
        
        IF v_user.email LIKE 'conctest_sender_%' THEN
            v_balance := 10000.00;
        ELSE
            v_balance := 0.00;
        END IF;
        
        INSERT INTO bank_accounts (user_id, user_handle, bank_id, bank_name, account_number, ifsc_code, branch, balance, is_primary)
        VALUES (v_user.id, v_handle, v_bank_id, 'ConcTest Bank', v_acct_no, 'CONC0000001', 'Test Branch', v_balance, true)
        ON CONFLICT (user_handle) DO UPDATE SET balance = EXCLUDED.balance;
    END LOOP;
END $$;

SELECT 'Test Users' as entity, COUNT(*) as count FROM users WHERE email LIKE 'conctest_%@nexuspay.test'
UNION ALL
SELECT 'Test Bank Accounts', COUNT(*) FROM bank_accounts WHERE user_handle LIKE 'conctest_%@nexus'
UNION ALL
SELECT 'Senders', COUNT(*) FROM bank_accounts WHERE user_handle LIKE 'conctest_sender_%@nexus'
UNION ALL
SELECT 'Receivers', COUNT(*) FROM bank_accounts WHERE user_handle LIKE 'conctest_recv_%@nexus';

SELECT ' Test database setup complete!' as status;
