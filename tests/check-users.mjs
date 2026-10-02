import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const pool = new pg.Pool({host:'localhost',port:5432,user:'postgres',password:'Aritra@2005',database:'wallet_db'});
const r = await pool.query("SELECT email FROM users WHERE email LIKE 'loadtest_%' LIMIT 5");
console.log('Load test users:', r.rows.length > 0 ? r.rows.map(x=>x.email).join(', ') : 'NONE FOUND - you need to run: psql -U postgres -d wallet_db -f tests/load/seed-load-test-data.sql');
await pool.end();
