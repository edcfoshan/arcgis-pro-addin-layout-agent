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

# Esri SDK 的打包目标(CodeTaskFactory)在 dotnet Core MSBuild 下不可用(MSB4801),dotnet build
# 只会编译 DLL 不会生成 .esriAddinX——这里自行铺 temp_archive 并压出 bin 包,结构与旧机器
# 的官方产物对齐:Config.daml + Install/{dll,deps.json,pdb,Layout/current-layout.json}
function Stage-AddInArchive {
    $assemblyName = Split-Path -Leaf $ProjectDir
    $binDir = Join-Path $ProjectDir "bin\$Configuration\net8.0-windows7.0"
    $staging = Join-Path $ProjectDir "obj\$Configuration\net8.0-windows7.0\temp_archive"
    if (Test-Path $staging) {
        Remove-Item -Path $staging -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Path (Join-Path $staging 'Install\Layout') -Force | Out-Null

    Copy-Item (Join-Path $ProjectDir 'Config.daml') $staging -Force
    foreach ($file in @("$assemblyName.dll", "$assemblyName.deps.json", "$assemblyName.pdb")) {
        Copy-Item (Join-Path $binDir $file) (Join-Path $staging 'Install') -Force
    }
    Copy-Item (Join-Path $binDir 'Layout\current-layout.json') (Join-Path $staging 'Install\Layout') -Force

    Compress-Archive -Path (Join-Path $staging '*') -DestinationPath (Join-Path $binDir "$assemblyName.esriAddinX") -Force
    Write-Host "Staged add-in archive: $staging"
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
    Stage-AddInArchive
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
