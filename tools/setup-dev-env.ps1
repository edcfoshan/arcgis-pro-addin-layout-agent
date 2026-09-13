# 开发环境体检 + 安装脚本(幂等,可反复运行)
#
# 用法:
#   powershell -File tools/setup-dev-env.ps1                # 只体检,打印缺失项
#   powershell -File tools/setup-dev-env.ps1 -Install       # 缺什么用什么装(winget)
#   powershell -File tools/setup-dev-env.ps1 -Install -WithDeps  # 装完工具链后顺带 npm install
#
# 工具链要求(与 CLAUDE.md / package.json 对应):
#   Node.js >= 20.19(Vite 8 要求,建议 22 LTS)
#   Rust stable(x86_64-pc-windows-msvc)+ VS Build Tools C++ 工作负载(Tauri 链接器)
#   .NET 8 SDK(验算插件 dotnet build)
param(
  [switch]$Install,
  [switch]$WithDeps
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$script:missing = @()

function Test-Cmd([string]$Name) {
  [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Report([string]$Item, [bool]$Ok, [string]$Detail, [string]$Fix) {
  $mark = if ($Ok) { '[OK]  ' } else { '[缺失]' }
  Write-Host ("{0} {1,-16} {2}" -f $mark, $Item, $Detail)
  if (-not $Ok) {
    $script:missing += $Item
    if ($Fix) { Write-Host ("        -> {0}" -f $Fix) -ForegroundColor Yellow }
  }
}

function GetFirstLine([string]$Name) {
  try { (& $Name --version 2>$null | Select-Object -First 1) } catch { '' }
}

Write-Host "=== 开发环境体检($repoRoot)===" -ForegroundColor Cyan

# --- winget(安装通道本身) ---
$hasWinget = Test-Cmd winget
Report 'winget' $hasWinget "$(if ($hasWinget) { '可用' } else { '无法自动安装,需手动装工具链' })" '从 Microsoft Store 安装「应用安装程序」'

# --- Node.js / npm ---
$hasNode = Test-Cmd node
$nodeVer = if ($hasNode) { GetFirstLine node } else { '' }
$nodeOk = $false
if ($hasNode) {
  $major = 0
  if ($nodeVer -match 'v(\d+)\.') { $major = [int]$Matches[1] }
  # Vite 8 要求 20.19+ 或 22.12+,这里按 >= 20 判定,版本细节打印出来人工确认
  $nodeOk = ($major -ge 20 -and $nodeVer -notmatch 'v20\.(0|1[0-8])(\D|$)')
}
Report 'Node.js' $nodeOk $nodeVer 'winget install OpenJS.NodeJS.LTS'
Report 'npm' (Test-Cmd npm) "$(if (Test-Cmd npm) { GetFirstLine npm } else { '' })" '随 Node.js 一起安装'

# --- Rust(rustup / cargo) ---
$hasCargo = Test-Cmd cargo
Report 'Rust(cargo)' $hasCargo "$(if ($hasCargo) { GetFirstLine cargo } else { '' })" 'winget install Rustlang.Rustup,然后 rustup default stable-msvc'

# --- .NET SDK(>= 8 即可,新 SDK 可构建 net8.0 目标) ---
$hasDotnet = Test-Cmd dotnet
$dotnetOk = $false
$dotnetVer = ''
if ($hasDotnet) {
  $dotnetVer = (& dotnet --version 2>$null)
  $dotnetMajor = 0
  if ($dotnetVer -match '(\d+)\.') { $dotnetMajor = [int]$Matches[1] }
  $dotnetOk = ($dotnetMajor -ge 8)
}
Report '.NET SDK(>=8)' $dotnetOk $dotnetVer 'winget install Microsoft.DotNet.SDK.8'

# --- VS Build Tools C++ 工作负载(Tauri 需要 MSVC link.exe) ---
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$hasVC = $false
if (Test-Path $vswhere) {
  $hasVC = [bool](& $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null)
}
Report 'VS Build Tools (C++)' $hasVC "$(if ($hasVC) { '已含 VC 工具集' } else { '未检测到 VC 工具集' })" 'winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive"'

# --- ArcGIS Pro(验算管线需要,提示性;兼容机器级/用户级安装) ---
$proExeCandidates = @(
  "$env:ProgramFiles\ArcGIS\Pro\bin\ArcGISPro.exe",
  "$env:LOCALAPPDATA\Programs\ArcGIS\Pro\bin\ArcGISPro.exe"
)
$proExe = $proExeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
Report 'ArcGIS Pro' ([bool]$proExe) "$(if ($proExe) { $proExe } else { '未安装,验算截图流程不可用' })" '安装 ArcGIS Pro 3.x'

# --- 图标缓存(应已随仓库 vendored) ---
$iconCache = Join-Path $repoRoot 'tools\icon-cache'
$iconOk = (Test-Path $iconCache) -and ((Get-ChildItem $iconCache -Filter *.png -ErrorAction SilentlyContinue | Measure-Object).Count -gt 1000)
Report '图标缓存' $iconOk "tools\icon-cache" 'git checkout 恢复,或用 tools/icon-extract 重新提取'

Write-Host ''

# --- 安装阶段 ---
if ($Install) {
  if (-not $hasWinget) {
    Write-Host '没有 winget,无法自动安装,请按上面的提示手动安装。' -ForegroundColor Red
    exit 1
  }
  if (-not $nodeOk)      { winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements }
  if (-not $hasCargo)    { winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements }
  if (-not $dotnetOk)    { winget install --id Microsoft.DotNet.SDK.8 -e --accept-source-agreements --accept-package-agreements }
  if (-not $hasVC)       { winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive" --accept-source-agreements --accept-package-agreements }

  Write-Host ''
  Write-Host '安装命令已执行。新装的工具需要【重开终端】才能进 PATH,然后重跑本脚本复查:' -ForegroundColor Cyan
  Write-Host '  powershell -File tools/setup-dev-env.ps1'
  if ($hasCargo -eq $false) {
    Write-Host 'rustup 装完记得: rustup default stable-msvc' -ForegroundColor Yellow
  }
}
elseif ($script:missing.Count -gt 0) {
  Write-Host ("缺失 {0} 项。确认无误后运行: powershell -File tools/setup-dev-env.ps1 -Install" -f $script:missing.Count) -ForegroundColor Yellow
}

# --- npm install(designer-app 前端依赖) ---
if ($WithDeps -and (Test-Cmd npm)) {
  Write-Host ''
  Write-Host '=== npm install(designer-app)===' -ForegroundColor Cyan
  Push-Location (Join-Path $repoRoot 'designer-app')
  try { npm install } finally { Pop-Location }
  if (Test-Path (Join-Path $repoRoot 'designer-app\node_modules')) {
    Write-Host 'node_modules 已就绪。验证: cd designer-app; npx tsc --noEmit' -ForegroundColor Green
  }
}
elseif ($WithDeps) {
  Write-Host 'npm 不可用,跳过依赖安装(先装 Node.js)。' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '=== 全部就绪后的验证清单 ==='
Write-Host '  1. cd designer-app; npx tsc --noEmit              # 前端类型检查'
Write-Host '  2. npm run tauri dev                              # 设计器起得来(首次 Rust 全量编译较慢)'
Write-Host '  3. cd src-tauri; cargo test --lib                 # Rust 单元测试'
Write-Host '  4. powershell -File tools/build-arcgis-pro-validation.ps1 -Version 0.0.1   # .NET 插件编译 + 打包'
