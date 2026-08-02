import cron from 'node-cron';
import pool from '../config/db.js';

export const startSweeperJob = () => {
    cron.schedule('*/15 * * * *', async () => {
        console.log('[SWEEPER] Waking up to clean abandoned transactions...');
        
        try {
     
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