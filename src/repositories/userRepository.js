import pool from '../config/db.js';

export const createUser = async (fullName, email, phone, passwordHash, aadharNumber) => {
    const insertUserText = `
        INSERT INTO users (full_name, email, phone, password_hash, aadhar_number)
        VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, email, phone;
    `;
    const result = await pool.query(insertUserText, [fullName, email, phone, passwordHash, aadharNumber]);
    
    return { user: result.rows[0] };
};

export const getUserByEmail = async (email) => {
    const queryText = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(queryText, [email]);
    return result.rows[0]; 
};