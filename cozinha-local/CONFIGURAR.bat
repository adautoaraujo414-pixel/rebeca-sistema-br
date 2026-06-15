@echo off
chcp 65001 >nul
title Rebeca Cozinha - Configuração
color 0A
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   REBECA COZINHA — CONFIGURAÇÃO INICIAL  ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  Este assistente vai configurar o programa
echo  para o SEU restaurante. Faça isso UMA VEZ.
echo.

:: ── Verificar se já existe config ──
if exist config.json (
  echo  [!] config.json já existe.
  set /p RECONF= Reconfigurar? (s/n): 
  if /i not "%RECONF%"=="s" goto INICIAR
)

echo.
echo  ── PASSO 1: Dados do restaurante ─────────────────
echo.
set /p NOME= Nome do restaurante (ex: Churrascaria do Joao): 
set /p ADMIN_ID= AdminId (fornecido pela Rebeca): 
echo.
echo  ── PASSO 2: IP da impressora térmica ─────────────
echo.
echo  Dica: no Windows, abra o CMD e digite: arp -a
echo  Procure o IP da impressora na lista (ex: 192.168.1.100)
echo.
set /p IP_IMP= IP da impressora (ex: 192.168.1.100): 
set /p PORTA_IMP= Porta (Enter para usar 9100): 
if "%PORTA_IMP%"=="" set PORTA_IMP=9100

echo.
echo  ── PASSO 3: Servidor Rebeca ───────────────────────
echo.
set SERVIDOR=https://rebecasistemas.com.br
echo  Servidor padrao: %SERVIDOR%
set /p SERVIDOR_OPT= Outro servidor? (Enter para usar o padrao): 
if not "%SERVIDOR_OPT%"=="" set SERVIDOR=%SERVIDOR_OPT%

:: ── Gerar config.json via PowerShell ──
echo.
echo  Gerando config.json...

powershell -Command "& { $c = @{ nomeRestaurante='%NOME%'; adminId='%ADMIN_ID%'; token='cozinha-rebeca-2026'; servidor='%SERVIDOR%'; ipImpressora='%IP_IMP%'; portaImpressora=[int]'%PORTA_IMP%'; intervalo=5000 }; $c | ConvertTo-Json -Depth 2 | Set-Content -Encoding UTF8 'config.json'; Write-Host ' config.json salvo!' }"

if not exist config.json (
  echo  [ERRO] Falha ao gerar config.json
  pause
  exit /b
)

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   Configuração salva com sucesso!        ║
echo  ║                                          ║
echo  ║   Restaurante : %NOME%
echo  ║   AdminId     : %ADMIN_ID%
echo  ║   Impressora  : %IP_IMP%:%PORTA_IMP%
echo  ║   Servidor    : %SERVIDOR%
echo  ╚══════════════════════════════════════════╝
echo.
echo  Testando conexão com a impressora...
echo.

:: Teste rápido de porta TCP via PowerShell
powershell -Command "& { try { $t = New-Object Net.Sockets.TcpClient('%IP_IMP%', %PORTA_IMP%); $t.Close(); Write-Host ' [OK] Impressora acessível em %IP_IMP%:%PORTA_IMP%' } catch { Write-Host ' [!] Impressora não respondeu — verifique o IP e se está ligada' } }"

echo.

:INICIAR
:: ── Verificar Node.js ──
node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo  [!] Node.js não encontrado. Instalando...
  powershell -Command "& { $url='https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi'; $out='$env:TEMP\node.msi'; Invoke-WebRequest -Uri $url -OutFile $out; Start-Process msiexec -ArgumentList '/i',$out,'/quiet','/norestart' -Wait }"
  set "PATH=%PATH%;C:\Program Files\nodejs"
)

:: ── Configurar startup automático ──
powershell -Command "& { $ws=$([Runtime.InteropServices.Marshal]::GetActiveObject('WScript.Shell') 2>$null); $pasta=[Environment]::GetFolderPath('Startup'); $lnk=$pasta+'\RebecaCozinha.lnk'; $sh=New-Object -COM WScript.Shell; $s=$sh.CreateShortcut($lnk); $s.TargetPath='%~dp0INICIAR.bat'; $s.WorkingDirectory='%~dp0'; $s.Save() }" 2>nul

echo  ================================
echo   Iniciando Rebeca Cozinha...
echo   NAO feche esta janela!
echo  ================================
echo.

:LOOP
cd /d "%~dp0"
node servidor.js
echo.
echo  [!] Servidor parou. Reiniciando em 5s...
timeout /t 5 /nobreak >nul
goto LOOP
