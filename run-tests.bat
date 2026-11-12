@echo off
set PORT=3030
set BASE_URL=http://localhost:%PORT%
rem Start dev server in background
start "dev" cmd /C "npm run dev"
rem Wait for server to start (adjust if needed)
timeout /t 10 > nul
rem Run Playwright E2E tests
node prisma\_e2e-ui.mjs
