import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import redisClient from '../config/redis.js';

// Bypass rate limiting during load tests
const noopLimiter = (req, res, next) => next();

const createLimiter = (prefix, maxRequests) => {
    if (process.env.RATE_LIMIT_DISABLED === 'true') {
        console.log(`[RATE LIMITER] Disabled for prefix: ${prefix}`);
        return noopLimiter;
    }
    return rateLimit({
        windowMs: 15 * 60 * 1000, 
        max: maxRequests,
        standardHeaders: true,
        legacyHeaders: false,
        validate: { xForwardedForHeader: false },
        keyGenerator: (req) => {
           return req.ip || req.headers['x-forwarded-for'] || 'unknown';
        },
        store: new RedisStore({
            sendCommand: (...args) => redisClient.sendCommand(args),
            prefix: prefix,
        }),
    });
};

export const loginLimiter = createLimiter('rl:login:', 5);
export const transferLimiter = createLimiter('rl:transfer:', 20);