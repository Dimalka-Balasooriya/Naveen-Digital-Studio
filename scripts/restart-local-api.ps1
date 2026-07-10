$ErrorActionPreference = "Stop"

$portLine = netstat -ano | Select-String ":5000" | Select-Object -First 1
if ($portLine) {
  $pidText = ($portLine.ToString().Trim() -split "\s+")[-1]
  Stop-Process -Id ([int]$pidText) -Force
}

Start-Sleep -Seconds 1

$serverDir = Join-Path $PSScriptRoot "..\server"
Start-Process `
  -FilePath "C:\Program Files\nodejs\npm.cmd" `
  -ArgumentList @("start") `
  -WorkingDirectory $serverDir `
  -WindowStyle Hidden `
  -PassThru |
  Select-Object Id, ProcessName

Start-Sleep -Seconds 3
netstat -ano | Select-String ":5000"
