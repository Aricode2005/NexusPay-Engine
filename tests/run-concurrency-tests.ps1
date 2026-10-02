# NexusPay Concurrency & Load Test — Run Script (PowerShell)
# ===========================================================
# This script runs all three concurrency tests in sequence.
#
# PREREQUISITES:
#   1. PostgreSQL running with wallet_db
#   2. Redis running
#   3. Kafka running (for the server, not for tests)
#   4. Server running: cd wallet-backend && npm run dev
#   5. DB setup done: psql -U postgres -d wallet_db -f tests/concurrency/setup-test-db.sql
#   6. Jest installed: npm install --save-dev jest
#
# USAGE:
#   .\tests\run-concurrency-tests.ps1

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     NexusPay Engine — Concurrency Test Suite            ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if server is running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  Server is running" -ForegroundColor Green
} catch {
    Write-Host "  Server is NOT running at http://localhost:3000" -ForegroundColor Red
    Write-Host "   Start it first: npm run dev" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host " TEST 1: Double-Spend Prevention (50 concurrent transfers)" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
npx jest --config tests/concurrency/jest.config.cjs tests/concurrency/double-spend.test.cjs --forceExit --verbose

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host " TEST 2: Deadlock Prevention (200 cross-transfers A↔B)"     -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
npx jest --config tests/concurrency/jest.config.cjs tests/concurrency/deadlock.test.cjs --forceExit --verbose

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host " TEST 3: Idempotency (20 identical parallel requests)"      -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
npx jest --config tests/concurrency/jest.config.cjs tests/concurrency/idempotency.test.cjs --forceExit --verbose

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║     All concurrency tests complete!                     ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green
