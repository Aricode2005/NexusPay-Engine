import pg from 'pg';
const pool = new pg.Pool({host:'localhost',port:5432,user:'postgres',password:'Aritra@2005',database:'wallet_db'});

const hash = '$2b$10$f6DFvK6fvuYmgiWCQBmwDeH7LWd.52I0oJjIGndVdBkRHL0v4kv.K';

const r1 = await pool.query(
  "UPDATE users SET password_hash = $1 WHERE email LIKE 'loadtest_%' OR email LIKE 'conctest_%'",
  [hash]
);
console.log(`Updated ${r1.rowCount} test users with correct password hash`);

const r2 = await pool.query(
  "UPDATE users SET mpin = '1234' WHERE email LIKE 'loadtest_%' OR email LIKE 'conctest_%'"
);
console.log(`Set mpin for ${r2.rowCount} users`);

await pool.end();
