@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title Luker UI - Launcher

set "ROOT=%~dp0"
set "SERVER=%ROOT%server"
set "NODE_MIN=18"

echo.
echo ================================================
echo          Luker UI - One-Click Launcher
echo.
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:3000
echo   Data     : %SERVER%data
echo ================================================
echo.

:: ===== Step 1: Node.js =====
echo [1/5] Checking Node.js environment...

where node >nul 2>&1
if %errorlevel% neq 0 (
    set "FOUND=0"
    for %%D in (
        "%ProgramFiles%\nodejs"
        "%ProgramFiles(x86)%\nodejs"
        "%USERPROFILE%\AppData\Roaming\nvm"
        "%USERPROFILE%\.fnm"
    ) do (
        if !FOUND! equ 0 (
            if exist "%%~D\node.exe" (
                set "PATH=%%~D;!PATH!"
                set "FOUND=1"
            )
        )
    )
    if !FOUND! equ 0 (
        echo        [ERROR] Node.js not found. Install 18+
        echo        https://nodejs.org
        pause
        exit /b 1
    )
)

for /f "tokens=1 delims=v" %%V in ('node -v 2^>nul') do set "NODE_VER=%%V"
for /f "tokens=1 delims=." %%M in ("!NODE_VER!") do set "NODE_MAJ=%%M"
if !NODE_MAJ! lss %NODE_MIN% (
    echo        [ERROR] Node.js too old ^(%NODE_MIN%+, got !NODE_VER!^)
    pause
    exit /b 1
)
echo        Node.js v!NODE_VER! [OK]

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo        [ERROR] npm not found
    pause
    exit /b 1
)
for /f %%V in ('npm -v 2^>nul') do set "NPM_VER=%%V"
echo        npm v!NPM_VER! [OK]
echo.

:: ===== Step 2: Frontend deps =====
echo [2/5] Checking frontend dependencies...
cd /d "%ROOT%"
if not exist "node_modules" (
    echo        First run - installing frontend deps...
    call npm install --prefer-offline --no-audit --no-fund
    if !errorlevel! neq 0 (
        echo        [ERROR] Frontend install failed.
        pause
        exit /b 1
    )
    echo        Frontend deps installed [OK]
) else (
    echo        Frontend deps present [OK]
)
echo.

:: ===== Step 3: Backend deps =====
echo [3/5] Checking backend dependencies...
cd /d "%SERVER%"
if not exist "node_modules" (
    echo        First run - installing backend deps...
    call npm install --prefer-offline --no-audit --no-fund
    if !errorlevel! neq 0 (
        echo        [ERROR] Backend install failed.
        pause
        exit /b 1
    )
    echo        Backend deps installed [OK]
) else (
    echo        Backend deps present [OK]
)
echo.

:: ===== Step 4: Data dirs =====
echo [4/5] Checking data directories...
set "DATA=%SERVER%data"
for %%D in (
    "%DATA%"
    "%DATA%\characters"
    "%DATA%\chats"
    "%DATA%\worlds"
    "%DATA%\koboldAI_Settings"
    "%DATA%\openAI_Settings"
    "%DATA%\textGen_Settings"
    "%DATA%\novelAI_Settings"
    "%DATA%\instruct"
    "%DATA%\context"
) do (
    if not exist "%%~D" mkdir "%%~D"
)
echo        Data directories ready [OK]
echo.

:: ===== Step 5: Start services =====
echo [5/5] Starting services...

:: Kill old processes on ports 3000 and 5173
for /f "tokens=5" %%P in ('netstat -aon 2^>nul ^| findstr ":3000 .*LISTENING"') do (
    taskkill /pid %%P /f >nul 2>&1
)
for /f "tokens=5" %%P in ('netstat -aon 2^>nul ^| findstr ":5173 .*LISTENING"') do (
    taskkill /pid %%P /f >nul 2>&1
)

:: Start backend in a new minimized window
cd /d "%SERVER%"
echo        Starting backend...
start "Luker Backend" /min cmd /c "npx tsx src/index.ts & pause"

:: Wait for backend to listen on port 3000
set "BACKEND_READY=0"
for /L %%I in (1,1,30) do (
    if !BACKEND_READY! equ 0 (
        ping -n 2 127.0.0.1 >nul 2>&1
        netstat -aon 2>nul | findstr ":3000 .*LISTENING" >nul 2>&1
        if !errorlevel! equ 0 (
            set "BACKEND_READY=1"
        )
    )
)
if !BACKEND_READY! equ 1 (
    echo        Backend ready [OK]  http://localhost:3000
) else (
    echo        [WARN] Backend not responding on :3000 after 30s
    echo        Check the backend window for errors.
    echo        Proceeding with frontend startup...
)
echo.

:: Start frontend (blocking - this is the main process)
cd /d "%ROOT%"
echo ================================================
echo   Luker UI - Frontend Dev Server (:5173)
echo ================================================
echo.
echo   Open http://localhost:5173 in your browser.
echo   Press Ctrl+C to stop.
echo.
echo ------------------------------------------------
echo.

call npx vite --host

:: Cleanup backend on exit
for /f "tokens=5" %%P in ('netstat -aon 2^>nul ^| findstr ":3000 .*LISTENING"') do (
    taskkill /pid %%P /f >nul 2>&1
)
echo.
echo Luker UI stopped.
pause
