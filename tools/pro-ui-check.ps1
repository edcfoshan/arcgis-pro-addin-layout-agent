param(
    [string]$CaseDir,
    [int]$WaitSeconds = 60,
    [switch]$SkipLaunch,
    [switch]$SkipInstallAddin,
    [switch]$SkipSelectTab,
    [string]$TabKeyTip
)

$ErrorActionPreference = 'Stop'

if (-not $CaseDir) {
    throw 'CaseDir is required.'
}

$caseDirPath = Resolve-Path $CaseDir
$screenshotPath = Join-Path $caseDirPath 'arcgis-pro-screen.png'
$configPath = Join-Path $caseDirPath 'Config.daml'
$addinCandidates = @(Get-ChildItem -Path $caseDirPath -Filter '*.esriAddinX' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
$addinPackage = $addinCandidates | Select-Object -First 1

$proCandidates = @(
    "$env:ProgramFiles\ArcGIS\Pro\bin\ArcGISPro.exe",
    "${env:ProgramFiles(x86)}\ArcGIS\Pro\bin\ArcGISPro.exe",
    "$env:LOCALAPPDATA\Programs\ArcGIS\Pro\bin\ArcGISPro.exe"
)

$proExe = $proCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

function Get-ReadyProProcess {
    Get-Process -Name 'ArcGISPro' -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero -and $_.Responding } |
        Select-Object -First 1
}

# 轮询等待 Pro 主窗口就绪,超时返回 $null;替代盲等,避免窗口没起来就把桌面截下来
function Wait-ProMainWindowReady([int]$TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $proc = Get-ReadyProProcess
        if ($proc) { return $proc }
        Start-Sleep -Milliseconds 500
    }
    return $null
}

function Get-AddInInstallDir {
    $docs = [Environment]::GetFolderPath('MyDocuments')
    if (-not $docs) { return $null }
    return (Join-Path $docs 'ArcGIS\AddIns\ArcGISPro\GisProRibbonLayoutValidator')
}

function Install-AddInPackage([string]$packagePath) {
    $installDir = Get-AddInInstallDir
    if (-not $installDir) {
        throw 'Cannot resolve Documents folder to install Add-in.'
    }

    # Keep installs isolated in our own folder so it is safe to overwrite.
    if (Test-Path $installDir) {
        Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null

    # ArcGIS Pro loads add-ins from extracted folders. `.esriAddinX` is a zip archive.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($packagePath, $installDir)
    return $installDir
}

function Resolve-TabKeyTip {
    param(
        [string]$Explicit,
        [string]$ConfigDamlPath
    )

    if ($Explicit) { return $Explicit.Trim() }
    if (-not (Test-Path $ConfigDamlPath)) { return $null }

    try {
        [xml]$xml = Get-Content -Path $ConfigDamlPath -Raw -Encoding UTF8
        $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
        $ns.AddNamespace('d', 'http://schemas.esri.com/DADF/Registry') | Out-Null
        $tabNode = $xml.SelectSingleNode('//d:tab[@keytip]', $ns)
        if ($tabNode -and $tabNode.keytip) {
            return [string]$tabNode.keytip
        }
    } catch {
        return $null
    }

    return $null
}

function Try-SelectTab([string]$keyTip) {
    if (-not $keyTip) { return $false }

    try {
        $wshell = New-Object -ComObject WScript.Shell
        Start-Sleep -Milliseconds 500
        [void]$wshell.AppActivate('ArcGIS Pro')
        Start-Sleep -Milliseconds 350
        # Send Alt then the tab keytip (single character recommended).
        $wshell.SendKeys('%')
        Start-Sleep -Milliseconds 200
        $wshell.SendKeys($keyTip)
        return $true
    } catch {
        return $false
    }
}

if (-not $SkipInstallAddin) {
    if (-not $addinPackage) {
        throw 'No .esriAddinX was found in CaseDir. Build the case first.'
    }
    $installedTo = Install-AddInPackage $addinPackage.FullName
    Write-Host "Add-in installed to: $installedTo"
}

$existing = Get-ReadyProProcess
if ($existing) {
    Write-Host "复用已运行的 ArcGIS Pro (PID $($existing.Id)),不再启动新实例。"
} elseif (-not $SkipLaunch) {
    if (-not $proExe) {
        throw 'ArcGISPro.exe was not found.'
    }
    Start-Process -FilePath $proExe | Out-Null
}

$pro = Wait-ProMainWindowReady -TimeoutSeconds $WaitSeconds
if (-not $pro) {
    throw "ArcGIS Pro 主窗口在 ${WaitSeconds}s 内未就绪,已取消截图。"
}
Write-Host "ArcGIS Pro 主窗口就绪 (PID $($pro.Id))。"
Start-Sleep -Seconds 3

# 截图/切页签前把 Pro 拉到前台:还原最小化 + SetForegroundWindow,并验证前台句柄确实是 Pro
# (AppActivate 对最小化窗口不可靠,曾经导致截屏拍到桌面造成假阳性)
Add-Type '
using System;
using System.Runtime.InteropServices;
public static class ProWin32 {
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'
$foregroundOk = $false
$foregroundDeadline = (Get-Date).AddSeconds(10)
$fgShell = New-Object -ComObject WScript.Shell
while ((Get-Date) -lt $foregroundDeadline) {
    $pro.Refresh()
    $handle = $pro.MainWindowHandle
    if ($handle -eq [IntPtr]::Zero) {
        throw 'ArcGIS Pro 主窗口句柄丢失,已取消截图。'
    }
    if ([ProWin32]::IsIconic($handle)) {
        [void][ProWin32]::ShowWindowAsync($handle, 9)  # SW_RESTORE
        Start-Sleep -Milliseconds 600
    }
    # Windows 前台锁:后台进程直接 SetForegroundWindow 会被拒,先模拟一次 Alt 输入解锁
    try { $fgShell.SendKeys('%') } catch { }
    [void][ProWin32]::SetForegroundWindow($handle)
    Start-Sleep -Milliseconds 400
    if ([ProWin32]::GetForegroundWindow() -eq $handle) { $foregroundOk = $true; break }
}
if (-not $foregroundOk) {
    throw '无法把 ArcGIS Pro 置于前台,已取消截图(前台窗口不是 Pro,截屏会拍到桌面)。'
}

if (-not $SkipSelectTab) {
    $keyTip = Resolve-TabKeyTip -Explicit $TabKeyTip -ConfigDamlPath $configPath
    if ($keyTip) {
        $ok = Try-SelectTab $keyTip
        if ($ok) {
            Write-Host "Tried selecting tab with keytip: $keyTip"
            Start-Sleep -Milliseconds 600
        } else {
            Write-Host "Could not auto-select tab (keytip: $keyTip)."
        }
    } else {
        Write-Host 'No tab keytip found; skipping auto-select.'
    }
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

try {
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $bitmap.Save($screenshotPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    $graphics.Dispose()
    $bitmap.Dispose()
}

$reportJson = [pscustomobject]@{
    screenshot = $screenshotPath
    capturedAt = (Get-Date).ToString('o')
    proPid = $pro.Id
    windowReady = $true
} | ConvertTo-Json
# 用 WriteAllText 写 UTF-8 无 BOM:PS5.1 的 Set-Content -Encoding UTF8 会带 BOM,下游 serde_json 解析会失败
[System.IO.File]::WriteAllText((Join-Path $caseDirPath 'pro-ui-check.json'), $reportJson)

Write-Host "ArcGIS Pro screenshot saved: $screenshotPath"
