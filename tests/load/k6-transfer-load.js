/**
 * k6 Load Test Script: Two-Step Transfer Flow (NexusPay Engine)
 *
 * Flow:
 * 1. Setup phase: Authenticates User A and User B via /api/v1/auth/login to retrieve JWT tokens.
 * 2. VU Execution phase:
 *    - POST /api/v1/transactions/intent  (User A creates intent to send ₹1 to User B)
 *    - POST /api/v1/transactions/execute (User A executes the transfer with MPIN '1234')
 *    - Checks both responses return HTTP status 200.
 *    - Sleeps 0.5s between iterations.
 *
 * Stages:
 * - 0 -> 50 VUs over 30s (ramp-up)
 * - 50 VUs hold for 1m (steady-state load)
 * - 50 -> 0 VUs over 10s (ramp-down)
 *
 * Thresholds:
 * - http_req_duration p(95) < 500ms
 * - http_req_failed rate < 0.1 (under 10% errors)
 *
 * Prerequisite:
 * Ensure test data has been seeded via `seed-load-test-data.sql`
 * and rate limiter in backend is relaxed for high-throughput testing.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  
    { duration: '1m', target: 50 },   
    { duration: '10s', target: 0 },  
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.1'],    
  },
};


export function setup() {
  const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';

  const loginHeaders = {
    'Content-Type': 'application/json',
  };

  const loginResA = http.post(
    `${baseUrl}/api/v1/auth/login`,
    JSON.stringify({
      email: 'loadtest_a@nexuspay.test',
      password: 'LoadTest123!',
    }),
    { headers: loginHeaders }
  );

  const loginACheck = check(loginResA, {
    'setup: user A login status is 200': (r) => r.status === 200,
    'setup: user A token received': (r) => {
      try {
        return !!r.json('token');
      } catch (_) {
        return false;
      }
    },
  });

  if (!loginACheck) {
    throw new Error(
      `User A login failed (status: ${loginResA.status}, body: ${loginResA.body}). ` +
      `Ensure database has been seeded with seed-load-test-data.sql.`
    );
  }

  const loginResB = http.post(
    `${baseUrl}/api/v1/auth/login`,
    JSON.stringify({
      email: 'loadtest_b@nexuspay.test',
      password: 'LoadTest123!',
    }),
    { headers: loginHeaders }
  );

  const loginBCheck = check(loginResB, {
    'setup: user B login status is 200': (r) => r.status === 200,
    'setup: user B token received': (r) => {
      try {
        return !!r.json('token');
      } catch (_) {
        return false;
      }
    },
  });

  if (!loginBCheck) {
    throw new Error(
      `User B login failed (status: ${loginResB.status}, body: ${loginResB.body}). ` +
      `Ensure database has been seeded with seed-load-test-data.sql.`
    );
  }

  const tokenA = loginResA.json('token');
  const tokenB = loginResB.json('token');

  return {
    tokenA,
    tokenB,
    handleA: 'loadtest_a@nexus',
    handleB: 'loadtest_b@nexus',
  };
}


export default function (data) {
  const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.tokenA}`,
  };

  const intentPayload = JSON.stringify({
    transferMethod: 'HANDLE',
    userHandle: data.handleA,
    receiverHandle: data.handleB,
    amount: 1,
  });

  const intentRes = http.post(
    `${baseUrl}/api/v1/transactions/intent`,
    intentPayload,
    { headers: authHeaders }
  );

  const intentSuccess = check(intentRes, {
    'intent status is 200': (r) => r.status === 200,
    'intent returns order_id': (r) => {
      try {
        return !!r.json('order_id');
      } catch (_) {
        return false;
      }
    },
  });

  let orderId = null;
  if (intentSuccess) {
    try {
      orderId = intentRes.json('order_id');
    } catch (_) {}
  }

  if (orderId) {
    const executePayload = JSON.stringify({
      order_id: orderId,
      mpin: '1234',
    });

    const executeRes = http.post(
      `${baseUrl}/api/v1/transactions/execute`,
      executePayload,
      { headers: authHeaders }
    );

    check(executeRes, {
      'execute status is 200': (r) => r.status === 200,
      'execute returns success message': (r) => {
        try {
          return r.status === 200 && !!r.json('transaction');
        } catch (_) {
          return false;
        }
      },
    });
  }

  sleep(0.5);
}
