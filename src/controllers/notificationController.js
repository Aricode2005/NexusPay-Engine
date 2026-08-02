import pool from '../config/db.js';


export const getUserNotifications = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'Unauthorized access. User ID missing.' });
        }

        const userId = req.user.id;
        const result = await pool.query(
            'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
            [userId]
        );

        if (result.rows.length > 0) {
            await pool.query(
                'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE', 
                [userId]
            );
        }

        res.status(200).json({
            success: true,
            count: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        console.error('[CONTROLLER] Notification Fetch Error:', error.message);
        res.status(500).json({ error: 'Internal server error while retrieving notifications.' });
    }
};