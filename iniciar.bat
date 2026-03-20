@echo off
title Sistema de Incidencias ISP
echo.
echo ========================================
echo   Sistema de Gestion de Incidencias ISP
echo ========================================
echo.

echo Iniciando Backend...
start "Backend - Incidencias" cmd /k "cd /d "%~dp0backend" && node server.js"

timeout /t 2 /nobreak >nul

echo Iniciando Frontend...
start "Frontend - Incidencias" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo  Servicios iniciados:
echo  Backend:  http://localhost:3001
echo  Frontend: http://localhost:5173
echo ========================================
echo.
echo Abriendo navegador...
start http://localhost:5173
echo.
pause
