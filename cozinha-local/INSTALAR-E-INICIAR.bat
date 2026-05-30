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
    goto CONFIGURAR_STARTUP
)

echo  [!] Node.js nao encontrado. Instalando...
echo.

powershell -Command "& { $url = 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi'; $out = '$env:TEMP\node-installer.msi'; Write-Host ' Baixando Node.js LTS...'; Invoke-WebRequest -Uri $url -OutFile $out; Write-Host ' Instalando Node.js...'; Start-Process msiexec -ArgumentList '/i', $out, '/quiet', '/norestart' -Wait; Write-Host ' Concluido!' }"

timeout /t 5 /nobreak >nul
set "PATH=%PATH%;C:\Program Files\nodejs"

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERRO] Falha na instalacao do Node.js.
    echo  Instale manualmente em: https://nodejs.org
    pause
    exit /b
)
echo  [OK] Node.js instalado!

:CONFIGURAR_STARTUP
echo.
echo  Configurando inicio automatico com o Windows...

:: Criar atalho na pasta Startup do Windows via PowerShell
powershell -Command "& { $WshShell = New-Object -comObject WScript.Shell; $pasta = $WshShell.SpecialFolders('Startup'); $atalho = $WshShell.CreateShortcut($pasta + '\RebecaCozinha.lnk'); $atalho.TargetPath = '%~dp0INSTALAR-E-INICIAR.bat'; $atalho.WorkingDirectory = '%~dp0'; $atalho.WindowStyle = 1; $atalho.Description = 'Rebeca Cozinha - Servidor de Impressao'; $atalho.Save(); Write-Host ' Atalho criado em Startup!' }"

echo  [OK] Inicio automatico configurado!
echo.
echo  ================================
echo   Iniciando servidor...
echo   Nao feche esta janela!
echo  ================================
echo.

:INICIAR
cd /d "%~dp0"
node servidor.js

echo.
echo  [!] Servidor parou. Reiniciando em 5 segundos...
timeout /t 5 /nobreak >nul
goto INICIAR
