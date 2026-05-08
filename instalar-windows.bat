@echo off
title Instalador Rebeca Delivery - Sistema Local
color 0A
echo.
echo  ██████╗ ███████╗██████╗ ███████╗ ██████╗ █████╗ 
echo  ██╔══██╗██╔════╝██╔══██╗██╔════╝██╔════╝██╔══██╗
echo  ██████╔╝█████╗  ██████╔╝█████╗  ██║     ███████║
echo  ██╔══██╗██╔══╝  ██╔══██╗██╔══╝  ██║     ██╔══██║
echo  ██║  ██║███████╗██████╔╝███████╗╚██████╗██║  ██║
echo  ╚═╝  ╚═╝╚══════╝╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝
echo.
echo  Sistema Local - Funciona SEM INTERNET
echo  ==========================================
echo.

REM Verificar Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Docker nao encontrado. Baixando...
    start https://www.docker.com/products/docker-desktop/
    echo.
    echo  Por favor instale o Docker Desktop e execute este
    echo  arquivo novamente.
    pause
    exit
)

echo [✓] Docker encontrado!
echo.
echo [→] Iniciando Rebeca Delivery...
echo.

docker-compose up -d

echo.
echo [✓] Sistema iniciado com sucesso!
echo.
echo  Acesse: http://localhost:3000
echo.
echo  Abrindo navegador...
timeout /t 3 >nul
start http://localhost:3000
echo.
pause
