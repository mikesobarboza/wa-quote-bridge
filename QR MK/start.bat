@echo off
chcp 65001 >nul
title Sistema QR WhatsApp - Bridge Server

echo ========================================
echo   Iniciando Sistema QR WhatsApp
echo ========================================
echo.

REM Verifica se Python está instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Python não encontrado!
    echo Instale Python 3.8 ou superior.
    pause
    exit /b 1
)

REM Verifica se uvicorn está instalado
python -c "import uvicorn" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Instalando uvicorn...
    pip install uvicorn fastapi >nul 2>&1
)

REM Verifica se fastapi está instalado
python -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Instalando fastapi...
    pip install fastapi >nul 2>&1
)

echo [OK] Dependencias verificadas.
echo.

REM Inicia o servidor bridge
echo Iniciando servidor bridge...
start /B python -m uvicorn bridge_server:app --host 127.0.0.1 --port 8788

REM Aguarda o servidor iniciar
timeout /t 3 /nobreak >nul

echo Servidor iniciado em http://127.0.0.1:8788
echo.
echo [COMANDOS]
echo F6 - Abrir/Fechar monitor da fila
echo F7 - Repetir ultimo processamento
echo F10 + F9 - Capturar coordenadas
echo.
echo ========================================
echo Pressione qualquer tecla para fechar...
pause >nul

REM Fecha o servidor
taskkill /F /IM python.exe /T >nul 2>&1