@echo off
echo ========================================
echo  UPLOAD PARA GITHUB
echo  Repositorio: wa-quote-bridge
echo ========================================
echo.

cd /d "%~dp0"

REM Verificar se git esta instalado
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: Git nao esta instalado!
    echo Instale em: https://git-scm.com/download/win
    pause
    exit /b 1
)

REM Inicializar repositorio se nao existir
if not exist .git (
    echo Inicializando repositorio Git...
    git init
    git branch -M main
)

REM Configurar remote
echo Configurando remote do GitHub...
git remote remove origin 2>nul
git remote add origin https://github.com/mikesobarboza/wa-quote-bridge.git

REM Criar .gitignore se nao existir
if not exist .gitignore (
    echo Criando .gitignore...
    (
        echo __pycache__/
        echo *.py[cod]
        echo *$py.class
        echo *.so
        echo .Python
        echo build/
        echo dist/
        echo *.egg-info/
        echo .env
        echo venv/
        echo .vscode/
        echo .idea/
        echo *.log
        echo coords.ini
        echo config.ini
    ) > .gitignore
)

REM Adicionar todos os arquivos
echo Adicionando arquivos...
git add .

REM Fazer commit
echo Fazendo commit...
git commit -m "Update: Correcao do erro 'error sign' - type=1, gear e _t adicionados"

REM Push para GitHub
echo.
echo Fazendo upload para GitHub...
echo ATENCAO: Pode solicitar suas credenciais do GitHub
echo.
git push -u origin main --force

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo  SUCESSO! Codigo enviado para GitHub
    echo  https://github.com/mikesobarboza/wa-quote-bridge
    echo ========================================
) else (
    echo.
    echo ========================================
    echo  ERRO ao fazer upload!
    echo  Verifique suas credenciais do GitHub
    echo ========================================
)

echo.
pause
