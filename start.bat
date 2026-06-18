@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title CraftTalker - Launcher

set "ROOT=%~dp0"
set "SERVER=%ROOT%server"
set "NODE_REQUIRED=20.19+ or 22.12+"

echo.
echo ================================================
echo          CraftTalker - One-Click Launcher
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
        echo        [ERROR] Node.js not found. Install Node.js !NODE_REQUIRED!.
        echo        https://nodejs.org
        pause
        exit /b 1
    )
)

for /f "tokens=1 delims=v" %%V in ('node -v 2^>nul') do set "NODE_VER=%%V"
set "NODE_MAJ=0"
set "NODE_MINOR=0"
for /f "tokens=1,2 delims=." %%M in ("!NODE_VER!") do (
    set "NODE_MAJ=%%M"
    set "NODE_MINOR=%%N"
)
set "NODE_OK=0"
if !NODE_MAJ! gtr 22 set "NODE_OK=1"
if !NODE_MAJ! equ 22 if !NODE_MINOR! geq 12 set "NODE_OK=1"
if !NODE_MAJ! equ 20 if !NODE_MINOR! geq 19 set "NODE_OK=1"
if !NODE_OK! neq 1 (
    echo        [ERROR] Node.js too old ^(requires !NODE_REQUIRED!, got !NODE_VER!^)
    echo        Please install the current LTS from https://nodejs.org
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
set "FRONTEND_DEPS_OK=1"
if not exist "node_modules" set "FRONTEND_DEPS_OK=0"
if !FRONTEND_DEPS_OK! equ 1 (
    for %%D in (
        "node_modules\@tailwindcss\vite"
        "node_modules\@vitejs\plugin-react"
        "node_modules\i18next"
        "node_modules\i18next-browser-languagedetector"
        "node_modules\katex"
        "node_modules\react-i18next"
        "node_modules\react-router"
        "node_modules\shiki"
        "node_modules\vite"
        "node_modules\zustand"
    ) do (
        if not exist "%%~D" (
            echo        Missing %%~D
            set "FRONTEND_DEPS_OK=0"
        )
    )
)
if !FRONTEND_DEPS_OK! equ 0 (
    echo        Installing or repairing frontend deps...
    call npm install --include=dev --prefer-offline --no-audit --no-fund
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
set "BACKEND_DEPS_OK=1"
if not exist "node_modules" set "BACKEND_DEPS_OK=0"
if !BACKEND_DEPS_OK! equ 1 (
    for %%D in (
        "node_modules\@hono\node-server"
        "node_modules\@hono\zod-validator"
        "node_modules\.bin\tsx.cmd"
        "node_modules\hono"
        "node_modules\zod"
    ) do (
        if not exist "%%~D" (
            echo        Missing %%~D
            set "BACKEND_DEPS_OK=0"
        )
    )
)
if !BACKEND_DEPS_OK! equ 0 (
    echo        Installing or repairing backend deps...
    call npm install --include=dev --prefer-offline --no-audit --no-fund
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
    "%DATA%\extensions"
    "%DATA%\extensions\third-party"
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
start "CraftTalker Backend" /min cmd /c "npx tsx src/index.ts & pause"

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
echo   CraftTalker - Frontend Dev Server (:5173)
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
echo CraftTalker stopped.
pause
