@echo off
setlocal EnableExtensions
cd /d %~dp0

echo ===========================================
echo CWS Playwright runner (Build 31)
echo ===========================================
echo.

REM Ensure deps
if not exist node_modules (
  echo [1/4] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo ERROR: npm install failed.
    echo - Controleer of Node.js + npm geinstalleerd zijn.
    echo - Open dit bestand in een terminal om de exacte fout te zien.
    echo.
    pause
    exit /b 1
  )
)

REM Install Playwright browsers if needed (show output)
echo [2/4] Ensuring Playwright browsers...
call npx playwright install
if errorlevel 1 (
  echo.
  echo ERROR: Playwright browser install failed.
  echo Tip: probeer handmatig:  npx playwright install
  echo.
  pause
  exit /b 1
)

REM Playwright will start (or reuse) the server via playwright.config.js webServer
echo [3/4] Running Playwright tests (server managed by Playwright)...
npm run test:e2e

echo.
echo ===========================================
echo Done. Bekijk output hierboven.
echo ===========================================
pause
