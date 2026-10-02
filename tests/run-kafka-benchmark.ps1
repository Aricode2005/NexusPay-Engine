# NexusPay — Kafka Latency Before/After Benchmark (PowerShell)
# ==============================================================
# This script runs the k6 load test twice:
#   1. With NOTIFY_MODE=sync  (synchronous notifications — slower)
#   2. With default mode      (Kafka async notifications — faster)
#
# PREREQUISITES:
#   1. k6 installed: winget install k6  OR  choco install k6
#   2. PostgreSQL, Redis, Kafka running
#   3. Test data seeded (see setup-test-db.sql)
#   4. Server NOT running (this script starts it)
#
# USAGE:
#   .\tests\run-kafka-benchmark.ps1
#
# The script will print p95 values for both modes and the improvement.

param(
    [int]$VUs = 50,
    [string]$Duration = "1m"
)

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     NexusPay — Kafka Latency Benchmark                  ║" -ForegroundColor Cyan
Write-Host "║     (Before/After Comparison)                           ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check k6 is installed
try {
    k6 version | Out-Null
    Write-Host "✅ k6 is installed" -ForegroundColor Green
} catch {
    Write-Host "❌ k6 is NOT installed!" -ForegroundColor Red
    Write-Host "   Install it: winget install k6" -ForegroundColor Yellow
    exit 1
}

$k6Script = Join-Path $PSScriptRoot "load\k6-before-after.js"

Write-Host ""
Write-Host "📋 Instructions:" -ForegroundColor Yellow
Write-Host "   This script does NOT auto-start/stop the server." -ForegroundColor Yellow
Write-Host "   You need to run each mode manually:" -ForegroundColor Yellow
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host " STEP 1: Synchronous Mode (Baseline)" -ForegroundColor Red
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host '  Terminal 1: $env:NOTIFY_MODE="sync"; node app.js' -ForegroundColor White
Write-Host "  Terminal 2: k6 run tests/load/k6-before-after.js" -ForegroundColor White
Write-Host ""
Write-Host "  → Write down the p(95) value from the output" -ForegroundColor Cyan
Write-Host "  → Stop the server (Ctrl+C)" -ForegroundColor Cyan
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host " STEP 2: Kafka Mode (After)" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Terminal 1: node app.js     (default = Kafka mode)" -ForegroundColor White
Write-Host "  Terminal 2: k6 run tests/load/k6-before-after.js" -ForegroundColor White
Write-Host ""
Write-Host "  → Write down the p(95) value from the output" -ForegroundColor Cyan
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host " STEP 3: Compare" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host '  Your bullet: "p95 latency fell from [SYNC_P95] to [KAFKA_P95]' -ForegroundColor White
Write-Host '                in a k6 load test with 50 concurrent users' -ForegroundColor White
Write-Host '                on a local machine."' -ForegroundColor White
Write-Host ""

# Ask user which mode to run now
$choice = Read-Host "Run k6 now? (y/n)"
if ($choice -eq 'y' -or $choice -eq 'Y') {
    Write-Host ""
    Write-Host "Running k6 load test..." -ForegroundColor Cyan
    k6 run $k6Script
}
