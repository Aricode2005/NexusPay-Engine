import { ChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';
import pool from '../config/db.js';

let _currentAnalysisContext = null;

/**
 * Tool: Freeze a user's accounts due to suspected fraud.
 * Inserts an ACCOUNT_FROZEN notification so the system can block further transfers.
 */
const freezeAccountTool = tool(
    async ({ userId, reason }) => {
        await pool.query(
            `UPDATE users SET account_frozen = true, frozen_at = NOW(), frozen_reason = $2 WHERE id = $1`,
            [userId, reason]
        );
        
        await pool.query(
            `INSERT INTO fraud_events (user_id, transaction_id, risk_level, action_taken, agent_reasoning, context_snapshot)
             VALUES ($1, $2, 'CRITICAL', 'ACCOUNT_FROZEN', $3, $4)`,
            [userId, _currentAnalysisContext?.currentTx?.txId || null, reason, JSON.stringify(_currentAnalysisContext || {})]
        );

        await pool.query(
            `INSERT INTO notifications (user_id, type, title, message)
             VALUES ($1, $2, $3, $4)`,
            [
                userId,
                'ACCOUNT_FROZEN',
                '🔒 Account Frozen — Suspicious Activity',
                `Your account has been temporarily frozen due to suspicious activity. Reason: ${reason}. Please contact support to verify your identity.`,
            ]
        );
        console.log(`[FRAUD AGENT] 🔒 TOOL EXECUTED: freeze_account — User ${userId} frozen. Reason: ${reason}`);
        return `Account for user ${userId} has been frozen successfully. The user has been notified. Reason: ${reason}`;
    },
    {
        name: 'freeze_account',
        description:
            'Freeze a user account due to suspected fraudulent activity. Use this for CRITICAL risk situations — rapid-fire transfers, amounts far exceeding normal behavior, or clear fraud patterns.',
        schema: z.object({
            userId: z.string().describe('The UUID of the user whose account should be frozen'),
            reason: z.string().describe('Brief explanation of why the account is being frozen'),
        }),
    }
);

/**
 * Tool: Send a fraud alert notification to the user.
 * Used for high-risk situations that need immediate user awareness.
 */
const sendFraudAlertTool = tool(
    async ({ userId, alertMessage }) => {
        await pool.query(
            `INSERT INTO fraud_events (user_id, transaction_id, risk_level, action_taken, agent_reasoning, context_snapshot)
             VALUES ($1, $2, 'HIGH', 'ALERT_SENT', $3, $4)`,
            [userId, _currentAnalysisContext?.currentTx?.txId || null, alertMessage, JSON.stringify(_currentAnalysisContext || {})]
        );
        
        await pool.query(
            `INSERT INTO notifications (user_id, type, title, message)
             VALUES ($1, $2, $3, $4)`,
            [userId, 'FRAUD_ALERT', '🚨 Suspicious Activity Detected', alertMessage]
        );
        console.log(`[FRAUD AGENT] 🚨 TOOL EXECUTED: send_fraud_alert — User ${userId} alerted.`);
        return `Fraud alert sent to user ${userId}: ${alertMessage}`;
    },
    {
        name: 'send_fraud_alert',
        description:
            'Send a fraud alert notification to warn the user about suspicious activity on their account. Use for HIGH risk situations.',
        schema: z.object({
            userId: z.string().describe('The UUID of the user to alert'),
            alertMessage: z.string().describe('The detailed alert message explaining what was detected'),
        }),
    }
);

/**
 * Tool: Flag a user's transaction for manual review by the compliance team.
 * Used for medium-risk situations that are suspicious but not definitively fraud.
 */
const flagForReviewTool = tool(
    async ({ userId, analysis }) => {
        await pool.query(
            `INSERT INTO fraud_events (user_id, transaction_id, risk_level, action_taken, agent_reasoning, context_snapshot)
             VALUES ($1, $2, 'MEDIUM', 'FLAGGED_FOR_REVIEW', $3, $4)`,
            [userId, _currentAnalysisContext?.currentTx?.txId || null, analysis, JSON.stringify(_currentAnalysisContext || {})]
        );

        await pool.query(
            `INSERT INTO notifications (user_id, type, title, message)
             VALUES ($1, $2, $3, $4)`,
            [
                userId,
                'FRAUD_REVIEW',
                '📋 Transaction Under Review',
                `A recent transaction has been flagged for review: ${analysis}`,
            ]
        );
        console.log(`[FRAUD AGENT] 📋 TOOL EXECUTED: flag_for_review — User ${userId} flagged.`);
        return `User ${userId} has been flagged for manual compliance review. Analysis: ${analysis}`;
    },
    {
        name: 'flag_for_review',
        description:
            'Flag a user for manual review by the compliance team. Use for MEDIUM risk — patterns are unusual but not clearly fraudulent.',
        schema: z.object({
            userId: z.string().describe('The UUID of the user to flag'),
            analysis: z.string().describe('Your analysis of why this transaction is suspicious'),
        }),
    }
);

/** @type {ReturnType<typeof createReactAgent> | null} */
let fraudAgent = null;

export const initializeFraudAgent = async () => {
    try {
        console.log('[FRAUD AGENT] Initializing Autonomous Fraud Detection Agent...');

        const llm = new ChatOpenAI({
            modelName: 'Qwen/Qwen2.5-7B-Instruct',
            apiKey: process.env.HUGGINGFACE_API_KEY,
            configuration: {
                baseURL: 'https://router.huggingface.co/featherless-ai/v1/',
            },
            temperature: 0,
            maxTokens: 512,
            maxRetries: 2,
        });
        fraudAgent = createReactAgent({
            llm,
            tools: [freezeAccountTool, sendFraudAlertTool, flagForReviewTool],
        });

        console.log('[FRAUD AGENT] ✅ Agent initialized with 3 tools: freeze_account, send_fraud_alert, flag_for_review');
    } catch (error) {
        console.error('[FRAUD AGENT] ❌ Initialization failed:', error.message);
    }
};

/**
 * Gather all contextual data the agent needs to reason about a transaction.
 * This is the Perception + Memory layer of the agent.
 *
 * @param {string} senderId - UUID of the sender
 * @param {number} amount - Transaction amount
 * @param {string} txId - Transaction ID
 */
async function gatherFraudContext(senderId, amount, txId) {
    const currentTx = { txId, amount, timestamp: new Date().toISOString() };

    const recent10 = await pool.query(
        `SELECT count(*) AS tx_count, COALESCE(sum(amount), 0) AS total_amount
         FROM transactions
         WHERE sender_id = $1 AND status = 'SUCCESS'
           AND timestamp > NOW() - INTERVAL '10 minutes'`,
        [senderId]
    );

    const recent1h = await pool.query(
        `SELECT count(*) AS tx_count, COALESCE(sum(amount), 0) AS total_amount
         FROM transactions
         WHERE sender_id = $1 AND status = 'SUCCESS'
           AND timestamp > NOW() - INTERVAL '1 hour'`,
        [senderId]
    );

    const history = await pool.query(
        `SELECT count(*) AS total_txns,
                COALESCE(avg(amount), 0) AS avg_amount,
                COALESCE(max(amount), 0) AS max_amount
         FROM transactions
         WHERE sender_id = $1 AND status = 'SUCCESS'
           AND timestamp > NOW() - INTERVAL '30 days'`,
        [senderId]
    );

    const userRes = await pool.query(
        'SELECT full_name, email FROM users WHERE id = $1',
        [senderId]
    );

    return {
        currentTx,
        last10Min: recent10.rows[0],
        lastHour: recent1h.rows[0],
        last30Days: history.rows[0],
        user: userRes.rows[0] || { full_name: 'Unknown', email: 'Unknown' },
    };
}

// ============================================================================
// 4. MAIN ANALYSIS FUNCTION (Orchestrates the full agent loop)
// ============================================================================

export const analyzeTransaction = async (senderId, amount, txId, senderHandle, receiverHandle) => {
    if (!fraudAgent) {
        console.error('[FRAUD AGENT] Agent not initialized. Skipping fraud analysis.');
        return;
    }

    try {
        const ctx = await gatherFraudContext(senderId, amount, txId);
        _currentAnalysisContext = ctx;

        console.log(`[FRAUD AGENT] 📡 Analyzing TxID: ${txId} | ₹${parseFloat(amount).toLocaleString('en-IN')} | ${senderHandle} → ${receiverHandle}`);

        const agentPrompt = `You are an autonomous fraud detection agent for NexusPay, a digital wallet application.

Your job is to analyze a transaction and its surrounding context for fraud patterns, then take appropriate action using the tools available to you.

═══════════════════════════════════════════
CURRENT TRANSACTION UNDER ANALYSIS
═══════════════════════════════════════════
• Transaction ID: ${ctx.currentTx.txId}
• Amount: ₹${parseFloat(ctx.currentTx.amount).toLocaleString('en-IN')}
• From: ${senderHandle} → To: ${receiverHandle}
• Time: ${ctx.currentTx.timestamp}

═══════════════════════════════════════════
USER PROFILE
═══════════════════════════════════════════
• Name: ${ctx.user.full_name}
• Email: ${ctx.user.email}
• User ID: ${senderId}

═══════════════════════════════════════════
RECENT ACTIVITY (Last 10 minutes)
═══════════════════════════════════════════
• Number of transactions: ${ctx.last10Min.tx_count}
• Total amount sent: ₹${parseFloat(ctx.last10Min.total_amount).toLocaleString('en-IN')}

═══════════════════════════════════════════
RECENT ACTIVITY (Last 1 hour)
═══════════════════════════════════════════
• Number of transactions: ${ctx.lastHour.tx_count}
• Total amount sent: ₹${parseFloat(ctx.lastHour.total_amount).toLocaleString('en-IN')}

═══════════════════════════════════════════
HISTORICAL BEHAVIOR (Last 30 days)
═══════════════════════════════════════════
• Total transactions: ${ctx.last30Days.total_txns}
• Average transaction amount: ₹${parseFloat(ctx.last30Days.avg_amount).toFixed(2)}
• Maximum single transaction: ₹${parseFloat(ctx.last30Days.max_amount).toLocaleString('en-IN')}

═══════════════════════════════════════════
FRAUD DETECTION GUIDELINES
═══════════════════════════════════════════
• More than 3 transactions in 10 minutes → unusual velocity
• More than 10 transactions in 1 hour → suspicious pattern
• Single transaction exceeding 5× the user's 30-day average → anomalous amount
• Total sent in 10 minutes exceeding ₹50,000 → high-risk volume
• New users (fewer than 5 historical transactions) making large transfers → elevated risk

═══════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════
Analyze the data above. Determine the risk level:
• CRITICAL: Use freeze_account AND send_fraud_alert tools. Pass the userId "${senderId}" to both.
• HIGH: Use send_fraud_alert AND flag_for_review tools. Pass the userId "${senderId}" to both.
• MEDIUM: Use flag_for_review tool only. Pass the userId "${senderId}".
• LOW: This is a normal transaction. Do NOT call any tools. Just state the transaction is normal.

Analyze now and take action.`;

        const result = await fraudAgent.invoke({
            messages: [{ role: 'user', content: agentPrompt }],
        });

        const agentMessages = result.messages;
        const finalMessage = agentMessages[agentMessages.length - 1];
        console.log(`[FRAUD AGENT] ✅ Analysis complete for TxID ${txId}: ${finalMessage.content?.slice(0, 200) || 'Tools executed.'}`);

    } catch (error) {
        console.error(`[FRAUD AGENT] ❌ Error analyzing TxID ${txId}:`, error.message);
    }
};
