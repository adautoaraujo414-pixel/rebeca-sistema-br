@echo off
title Rebeca Cozinha - Servidor Local
echo.
echo  Iniciando Rebeca Cozinha...
echo.

:: Verificar Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo  ERRO: Node.js nao encontrado!
  echo.
  echo  Baixe e instale em: https://nodejs.org
  echo  Escolha a versao LTS
  echo.
  pause
  exit
)

echo  Node.js encontrado!
echo  Iniciando servidor...
echo.
node servidor.js
pause
