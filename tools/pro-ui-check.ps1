param(
    [string]$CaseDir,
    [int]$WaitSeconds = 12,
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
    "${env:ProgramFiles(x86)}\ArcGIS\Pro\bin\ArcGISPro.exe"
)

$proExe = $proCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

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

if (-not $SkipLaunch) {
    if (-not $proExe) {
        throw 'ArcGISPro.exe was not found.'
    }

    Start-Process -FilePath $proExe | Out-Null
}

Start-Sleep -Seconds $WaitSeconds

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

[pscustomobject]@{
    screenshot = $screenshotPath
    capturedAt = (Get-Date).ToString('o')
} | ConvertTo-Json | Set-Content -Path (Join-Path $caseDirPath 'pro-ui-check.json') -Encoding UTF8

Write-Host "ArcGIS Pro screenshot saved: $screenshotPath"
