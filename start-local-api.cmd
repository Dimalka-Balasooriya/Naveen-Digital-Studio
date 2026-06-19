@echo off
cd /d "%~dp0server"
echo Starting API from %CD% > "%~dp0local-api.log"
"C:\Program Files\nodejs\npm.cmd" start >> "%~dp0local-api.log" 2>&1
echo API command exited with %ERRORLEVEL% >> "%~dp0local-api.log"
