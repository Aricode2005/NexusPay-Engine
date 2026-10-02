/**
 * k6 Before/After Benchmark: Synchronous DB Notifications vs. Asynchronous Kafka Events
 *
 * =========================================================================================
 * HOW TO RUN THIS BENCHMARK:
 * =========================================================================================
 *
 * 1. Seed Test Data (Required once or before resetting):
 *    psql -U postgres -d <your_db_name> -f tests/load/seed-load-test-data.sql
 *
 * 2. Run in Synchronous Notification Mode (BEFORE - Blocking DB insert):
 *    - In terminal 1 (start backend with sync notifications):
 *        Windows (CMD):        set NOTIFY_MODE=sync && node app.js
 *        Windows (PowerShell): $env:NOTIFY_MODE="sync"; node app.js
 *        Linux/macOS:          NOTIFY_MODE=sync node app.js
 *    - In terminal 2 (run load test):
 *        k6 run tests/load/k6-before-after.js
 *    - Record the p(95) values for `execute_duration` and `http_req_duration`.
 *
 * 3. Run in Asynchronous Kafka Mode (AFTER - Non-blocking event streaming):
 *    - In terminal 1 (start backend with default Kafka mode):
 *        node app.js
 *    - In terminal 2 (run load test):
 *        k6 run tests/load/k6-before-after.js
 *    - Record the p(95) values for `execute_duration` and `http_req_duration`.
 *
 * 4. Compare Results:
 *    - Compare the p(95) and p(99) values of `execute_duration`.
 *    - In synchronous mode, the execute endpoint blocks while inserting rows into the
 *      notifications table. Under 100 concurrent VUs, this causes connection pool
 *      contention and elevated latency.
 *    - In asynchronous mode, the transfer event is pushed to Kafka and handled by a background
 *      consumer worker, significantly reducing execute latency and stabilizing throughput.
 *
 * Note on Rate Limiting:
 * Before running at 100 VUs, ensure rate limiting (transferLimiter in src/middlewares/rateLimiter.js)
 * is raised or bypassed for load testing.
 * =========================================================================================
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const intentDuration = new Trend('intent_duration');
const executeDuration = new Trend('execute_duration');

export const options = {
  stages: [
    { duration: '30s', target: 100 }, // Ramp up to 100 VUs over 30s
    { duration: '1m', target: 100 },  // Hold at 100 VUs for 1 minute
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of overall requests < 500ms
    http_req_failed: ['rate<0.1'],     // Error rate < 10%
    intent_duration: ['p(95)<500'],   // 95% of intent requests < 500ms
    execute_duration: ['p(95)<500'],  // 95% of execute requests < 500ms
  },
};


export function setup() {
  const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';

  const loginHeaders = {
    'Content-Type': 'application/json',
  };

  // Login User A
  const loginResA = http.post(
    `${baseUrl}/api/v1/auth/login`,
    JSON.stringify({
      email: 'loadtest_a@nexuspay.test',
      password: 'LoadTest123!',
    }),
    { headers: loginHeaders }
  );

  const loginACheck = check(loginResA, {
    'setup: user A login successful (status 200)': (r) => r.status === 200,
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
      `User A login failed with status ${loginResA.status}: ${loginResA.body}. ` +
      `Ensure seed-load-test-data.sql has been executed in PostgreSQL.`
    );
  }

  // Login User B
  const loginResB = http.post(
    `${baseUrl}/api/v1/auth/login`,
    JSON.stringify({
      email: 'loadtest_b@nexuspay.test',
      password: 'LoadTest123!',
    }),
    { headers: loginHeaders }
  );

  const loginBCheck = check(loginResB, {
    'setup: user B login successful (status 200)': (r) => r.status === 200,
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
      `User B login failed with status ${loginResB.status}: ${loginResB.body}. ` +
      `Ensure seed-load-test-data.sql has been executed in PostgreSQL.`
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

/**
 * Default function: Executed by each Virtual User (100 VUs).
 */
export default function (data) {
  const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.tokenA}`,
  };

  // Step 1: Create Transfer Intent
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

  intentDuration.add(intentRes.timings.duration);

  const intentSuccess = check(intentRes, {
    'intent status is 200': (r) => r.status === 200,
    'intent has order_id': (r) => {
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

    executeDuration.add(executeRes.timings.duration);

    check(executeRes, {
      'execute status is 200': (r) => r.status === 200,
      'execute returned transaction': (r) => {
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


export function teardown(data) {
  console.log(`
================================================================================
                    NEXUSPAY LOAD TEST BENCHMARK GUIDE
================================================================================
To compare Sync vs Async (Kafka) notification performance:

1. Test Synchronous Mode (Direct DB write):
   - Set NOTIFY_MODE=sync and start the backend:
       Windows (CMD):        set NOTIFY_MODE=sync && node app.js
       Windows (PowerShell): $env:NOTIFY_MODE="sync"; node app.js
       Linux/macOS:          NOTIFY_MODE=sync node app.js
   - Run the benchmark:
       k6 run tests/load/k6-before-after.js
   - Record the p(95) values for http_req_duration and execute_duration.

2. Test Asynchronous Mode (Kafka Event Producer - Default):
   - Start the backend with default Kafka mode:
       node app.js
   - Run the benchmark:
       k6 run tests/load/k6-before-after.js
   - Record the p(95) values for http_req_duration and execute_duration.

3. Compare Results:
   - Compare the p(95) and p(99) values of execute_duration.
   - Synchronous mode incurs DB write latency inside the request loop.
   - Asynchronous mode produces a Kafka event immediately and returns,
     leading to lower tail latency under high concurrent load (100 VUs).
================================================================================
`);
}
