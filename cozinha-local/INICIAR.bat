@echo off
title Rebeca Cozinha
cd /d "%~dp0"
:LOOP
node servidor.js
echo [!] Reiniciando em 5s...
timeout /t 5 /nobreak >nul
goto LOOP
