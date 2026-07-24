import cron from 'node-cron';
import pool from '../config/db.js';

// This cron expression '*/15 * * * *' means "Run this function every 15 minutes"
export const startSweeperJob = () => {
    cron.schedule('*/15 * * * *', async () => {
        console.log('[SWEEPER] Waking up to clean abandoned transactions...');
        
        try {
            // Find all PENDING transactions older than 30 minutes and mark them EXPIRED.
            // (Assumes your table has a 'timestamp' or 'created_at' column)
            const result = await pool.query(
                `UPDATE transactions 
                 SET status = 'EXPIRED' 
                 WHERE status = 'PENDING' 
                 AND timestamp < NOW() - INTERVAL '30 minutes'
                 RETURNING id, order_id`
            );

            if (result.rowCount > 0) {
                console.log(`[SWEEPER] Successfully expired ${result.rowCount} abandoned transactions.`);
            } else {
                console.log('[SWEEPER] No abandoned transactions found.');
            }

        } catch (error) {
            console.error('[SWEEPER] Error during database cleanup:', error.message);
        }
    });
};