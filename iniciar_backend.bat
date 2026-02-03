@echo off
REM Inicia o servidor backend bridge_server_com_licenciamento.py
cd /d "%~dp0"
start "Servidor Bridge" cmd /k python bridge_server_com_licenciamento.py
