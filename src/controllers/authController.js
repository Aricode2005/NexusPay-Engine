import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createUser, getUserByEmail } from '../repositories/userRepository.js';

export const signup = async (req, res) => {
    try {
        const { fullName, email, phone, password, aadharNumber } = req.body;

        if (!fullName || !email || !phone || !password || !aadharNumber) {
            return res.status(400).json({ error: 'All identity fields are required.' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        const data = await createUser(fullName, email, phone, passwordHash, aadharNumber);
    
        res.status(201).json({
            message: 'Identity registered successfully. Please proceed to Phase 2 to link a bank account.',
            data: data
        });

    } catch (error) {
        console.error('Signup Error:', error);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Email, Phone, or Aadhar already exists.' });
        }
        res.status(500).json({ error: 'Internal server error.' });
    }
};
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const user = await getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            { id: user.id }, 
            process.env.JWT_SECRET, 
            { expiresIn: '1h' } 
        );

        res.status(200).json({
            message: 'Login successful.',
            token: token
        });

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
};