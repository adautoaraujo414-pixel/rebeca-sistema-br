@echo off
title Rebeca Cozinha - Instalador
color 0A
echo.
echo  ================================
echo   REBECA COZINHA - INSTALADOR
echo  ================================
echo.

:: Verificar se Node ja esta instalado
node --version >nul 2>&1
if %errorlevel% == 0 (
    echo  [OK] Node.js ja instalado!
    goto INICIAR
)

echo  [!] Node.js nao encontrado. Instalando...
echo.

:: Baixar instalador do Node.js LTS via PowerShell
powershell -Command "& { $url = 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi'; $out = '%TEMP%\node-installer.msi'; Write-Host ' Baixando Node.js...'; Invoke-WebRequest -Uri $url -OutFile $out; Write-Host ' Instalando...'; Start-Process msiexec -ArgumentList '/i', $out, '/quiet', '/norestart' -Wait; Write-Host ' Node.js instalado!' }"

:: Aguardar instalacao
timeout /t 5 /nobreak >nul

:: Atualizar PATH
set "PATH=%PATH%;C:\Program Files\nodejs"

:: Verificar novamente
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERRO] Node.js nao instalado corretamente.
    echo  Por favor instale manualmente em: https://nodejs.org
    echo  Depois execute este arquivo novamente.
    pause
    exit /b
)
echo  [OK] Node.js instalado com sucesso!

:INICIAR
echo.
echo  Iniciando servidor da cozinha...
echo  Nao feche esta janela!
echo.

:: Ir para a pasta do servidor
cd /d "%~dp0"

:: Iniciar servidor
node servidor.js

echo.
echo  [!] Servidor parou. Pressione qualquer tecla para reiniciar...
pause >nul
goto INICIAR
