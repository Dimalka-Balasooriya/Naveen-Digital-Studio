@echo off
cd /d "%~dp0client"
echo Starting client from %CD% > "%~dp0local-client.log"
"C:\Program Files\nodejs\node.exe" dev-server.mjs >> "%~dp0local-client.log" 2>&1
echo Client command exited with %ERRORLEVEL% >> "%~dp0local-client.log"
