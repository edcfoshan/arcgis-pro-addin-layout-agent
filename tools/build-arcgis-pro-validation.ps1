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

$versionProps = @()
if ($Version) {
    $versionProps = @(
        "/p:PublicVersion=$Version",
        "/p:Version=$Version",
        "/p:AssemblyVersion=$Version.0",
        "/p:FileVersion=$Version.0",
        "/p:InformationalVersion=$Version"
    )
}

$dotnetCmd = Get-Command dotnet -ErrorAction SilentlyContinue
if ($dotnetCmd) {
    & dotnet build $projectFile -c $Configuration /restore @versionProps
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet build failed with exit code $LASTEXITCODE"
    }
    return
}

$msbuildCandidates = @(
    "$env:ProgramFiles\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe",
    "$env:ProgramFiles\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe",
    "$env:ProgramFiles\Microsoft Visual Studio\2022\Enterprise\MSBuild\Current\Bin\MSBuild.exe",
    "$env:ProgramFiles\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe"
)

$msbuild = $msbuildCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $msbuild) {
    throw 'Neither dotnet CLI nor MSBuild.exe was found. ArcGIS Pro Add-in packaging cannot continue.'
}

$msbuildArgs = @(
    $projectFile,
    '/restore',
    '/t:Build',
    "/p:Configuration=$Configuration"
) + $versionProps

& $msbuild @msbuildArgs
if ($LASTEXITCODE -ne 0) {
    throw "MSBuild failed with exit code $LASTEXITCODE"
}
