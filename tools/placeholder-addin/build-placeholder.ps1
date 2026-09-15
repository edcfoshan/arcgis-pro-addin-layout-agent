# 构建免编译导出用的占位 DLL(仅开发机需要跑一次;产物 vendored 进 designer-app/src-tauri/resources/placeholder/)
# 用户机器导出时直接复用打包资源,无需 .NET SDK。
param(
    [string]$Configuration = "Release"
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here "dist"

dotnet build (Join-Path $here "GisProRibbonLayoutValidator.AddIn.csproj") -c $Configuration -o $out
if ($LASTEXITCODE -ne 0) { throw "dotnet build 失败(exit $LASTEXITCODE)" }

$dst = Join-Path $here "..\..\designer-app\src-tauri\resources\placeholder"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item (Join-Path $out "GisProRibbonLayoutValidator.AddIn.dll") $dst -Force
Copy-Item (Join-Path $out "GisProRibbonLayoutValidator.AddIn.deps.json") $dst -Force
Write-Host "占位 DLL 已更新: $dst"
