import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import redisClient from '../config/redis.js';
const createLimiter = (prefix, maxRequests) => {
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