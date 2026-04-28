param(
    [string]$InputJson = (Join-Path $PSScriptRoot '..\arcgis-pro-validation\GisProRibbonLayoutValidator.AddIn\Layout\current-layout.json'),
    [string]$ProjectDir = (Join-Path $PSScriptRoot '..\arcgis-pro-validation\GisProRibbonLayoutValidator.AddIn'),
    [string]$Configuration = 'Debug',
    [string]$Version
)

$syncScript = Join-Path $PSScriptRoot 'sync-arcgis-pro-validation.ps1'
$projectFile = Join-Path $ProjectDir 'GisProRibbonLayoutValidator.AddIn.csproj'

if ($Version) {
    & $syncScript -InputJson $InputJson -ProjectDir $ProjectDir -Version $Version
} else {
    & $syncScript -InputJson $InputJson -ProjectDir $ProjectDir
}

$msbuildCandidates = @(
    "$env:ProgramFiles\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe",
    "$env:ProgramFiles\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe",
    "$env:ProgramFiles\Microsoft Visual Studio\2022\Enterprise\MSBuild\Current\Bin\MSBuild.exe"
)

$msbuild = $msbuildCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $msbuild) {
    throw 'MSBuild.exe was not found. ArcGIS Pro Add-in packaging cannot continue.'
}

$msbuildArgs = @(
    $projectFile,
    '/restore',
    '/t:Build',
    "/p:Configuration=$Configuration"
)
if ($Version) {
    $msbuildArgs += @(
        "/p:PublicVersion=$Version",
        "/p:Version=$Version",
        "/p:AssemblyVersion=$Version.0",
        "/p:FileVersion=$Version.0",
        "/p:InformationalVersion=$Version"
    )
}

& $msbuild @msbuildArgs
if ($LASTEXITCODE -ne 0) {
    throw "MSBuild failed with exit code $LASTEXITCODE"
}
