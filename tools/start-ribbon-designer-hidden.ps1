$ErrorActionPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$app = Join-Path $root 'ribbon-designer'
$downloadServer = Join-Path (Join-Path $root 'tools') 'fixed-download-server.mjs'
$port = 4173
$downloadPort = 4174
$url = "http://127.0.0.1:$port/"

$listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
$downloadListening = Get-NetTCPConnection -LocalPort $downloadPort -State Listen -ErrorAction SilentlyContinue

if (-not $listening) {
    Start-Process -FilePath 'npm.cmd' `
        -ArgumentList @('run', 'dev', '--', '--host', '127.0.0.1', '--port', "$port") `
        -WorkingDirectory $app `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $app 'vite.log') `
        -RedirectStandardError (Join-Path $app 'vite.err.log')

    Start-Sleep -Milliseconds 1500
}

if (-not $downloadListening) {
    Start-Process -FilePath 'node' `
        -ArgumentList @($downloadServer) `
        -WorkingDirectory $root `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $root 'fixed-download-server.log') `
        -RedirectStandardError (Join-Path $root 'fixed-download-server.err.log')

    Start-Sleep -Milliseconds 500
}

Start-Process $url
