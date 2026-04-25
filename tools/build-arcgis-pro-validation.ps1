param(
    [string]$InputJson = (Join-Path $PSScriptRoot '..\arcgis-pro-validation\GisProRibbonLayoutValidator.AddIn\Layout\current-layout.json'),
    [string]$ProjectDir = (Join-Path $PSScriptRoot '..\arcgis-pro-validation\GisProRibbonLayoutValidator.AddIn'),
    [string]$Configuration = 'Debug'
)

$syncScript = Join-Path $PSScriptRoot 'sync-arcgis-pro-validation.ps1'
$projectFile = Join-Path $ProjectDir 'GisProRibbonLayoutValidator.AddIn.csproj'

& $syncScript -InputJson $InputJson -ProjectDir $ProjectDir

$msbuildCandidates = @(
    "$env:ProgramFiles\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe",
    "$env:ProgramFiles\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe",
    "$env:ProgramFiles\Microsoft Visual Studio\2022\Enterprise\MSBuild\Current\Bin\MSBuild.exe"
)

$msbuild = $msbuildCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $msbuild) {
    throw 'MSBuild.exe was not found. ArcGIS Pro Add-in packaging cannot continue.'
}

& $msbuild $projectFile /restore /t:Build /p:Configuration=$Configuration
