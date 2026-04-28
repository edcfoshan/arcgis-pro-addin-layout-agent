param(
    [int]$Cases = 10,
    [int]$Seed = 0,
    [string]$OutputRoot = (Join-Path $PSScriptRoot '..\validation-runs'),
    [string]$Configuration = 'Debug',
    [switch]$RunProUiCheck
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$projectDir = Join-Path $repoRoot 'arcgis-pro-validation\GisProRibbonLayoutValidator.AddIn'
$buildScript = Join-Path $PSScriptRoot 'build-arcgis-pro-validation.ps1'
$randomGenerator = Join-Path $PSScriptRoot 'generate-random-ribbon-layouts.mts'
$proCheckScript = Join-Path $PSScriptRoot 'pro-ui-check.ps1'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outputRootPath = (New-Item -ItemType Directory -Path $OutputRoot -Force).FullName
$runDir = Join-Path $outputRootPath $timestamp
$casesRoot = Join-Path $runDir 'generated'
$reportPath = Join-Path $runDir 'report.html'
$resultsPath = Join-Path $runDir 'results.json'
$latestRunPath = Join-Path $outputRootPath 'LATEST_RUN.txt'
$latestReportPath = Join-Path $outputRootPath 'LATEST_REPORT.txt'
$latestJsonPath = Join-Path $outputRootPath 'LATEST.json'

$runDir = (New-Item -ItemType Directory -Path $runDir -Force).FullName

if ($Seed -le 0) {
    $Seed = [int]((Get-Date).Ticks % 1000000)
}

Write-Host "Generating random Ribbon layouts..."
node --experimental-strip-types $randomGenerator --out $casesRoot --cases $Cases --seed $Seed

$manifestPath = Join-Path $casesRoot 'manifest.json'
$manifest = Get-Content -Path $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$results = New-Object System.Collections.Generic.List[object]

foreach ($case in $manifest.cases) {
    $caseDir = Join-Path $runDir $case.id
    New-Item -ItemType Directory -Path $caseDir -Force | Out-Null

    $inputJson = Join-Path $casesRoot $case.relativePath
    $buildLog = Join-Path $caseDir 'build.log'
    $versionPatch = [Math]::Min(65534, 1000 + [int]($case.id -replace '\D', ''))
    $version = "1.$((Get-Date).DayOfYear).$versionPatch"
    $status = 'passed'
    $errorMessage = ''

    Copy-Item -Path $inputJson -Destination (Join-Path $caseDir 'layout.json') -Force

    try {
        & $buildScript -InputJson $inputJson -ProjectDir $projectDir -Configuration $Configuration -Version $version *> $buildLog
        $package = Get-ChildItem -Path (Join-Path $projectDir "bin\$Configuration\net8.0-windows7.0") -Filter '*.esriAddinX' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (-not $package) {
            throw 'Build succeeded but no .esriAddinX package was found.'
        }

        Copy-Item -Path (Join-Path $projectDir 'Config.daml') -Destination (Join-Path $caseDir 'Config.daml') -Force
        Copy-Item -Path (Join-Path $projectDir 'Generated\LayoutControls.g.cs') -Destination (Join-Path $caseDir 'LayoutControls.g.cs') -Force
        Copy-Item -Path $package.FullName -Destination (Join-Path $caseDir $package.Name) -Force

        if ($RunProUiCheck) {
            & $proCheckScript -CaseDir $caseDir -WaitSeconds 12 *> (Join-Path $caseDir 'pro-ui-check.log')
        }
    } catch {
        $status = 'failed'
        $errorMessage = $_.Exception.Message
        Add-Content -Path $buildLog -Value $errorMessage -Encoding UTF8
    }

    $results.Add([pscustomobject]@{
        id = $case.id
        name = $case.name
        profile = $case.profile
        groupCount = $case.groupCount
        controlCount = $case.controlCount
        columns = ($case.columns -join ', ')
        version = $version
        status = $status
        error = $errorMessage
        caseDir = $caseDir
    }) | Out-Null
}

$results | ConvertTo-Json -Depth 8 | Set-Content -Path $resultsPath -Encoding UTF8

$rows = foreach ($result in $results) {
    $statusClass = if ($result.status -eq 'passed') { 'passed' } else { 'failed' }
    $errorText = [System.Net.WebUtility]::HtmlEncode($result.error)
    @"
<tr class="$statusClass">
  <td>$($result.id)</td>
  <td>$([System.Net.WebUtility]::HtmlEncode($result.name))</td>
  <td>$($result.profile)</td>
  <td>$($result.groupCount)</td>
  <td>$($result.controlCount)</td>
  <td>$($result.columns)</td>
  <td>$($result.version)</td>
  <td>$($result.status)</td>
  <td>$errorText</td>
  <td><code>$([System.Net.WebUtility]::HtmlEncode($result.caseDir))</code></td>
</tr>
"@
}

$html = @"
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>Ribbon Layout Validation $timestamp</title>
  <style>
    body { font-family: "Microsoft YaHei", "Segoe UI", sans-serif; margin: 24px; color: #1f2937; }
    h1 { font-size: 22px; margin: 0 0 12px; }
    .meta { color: #64748b; margin-bottom: 18px; }
    table { border-collapse: collapse; width: 100%; font-size: 13px; }
    th, td { border: 1px solid #d8e0ea; padding: 8px 10px; vertical-align: top; }
    th { background: #eef4fb; text-align: left; }
    tr.passed td:first-child { border-left: 4px solid #1f9d55; }
    tr.failed td:first-child { border-left: 4px solid #d64545; }
    code { font-family: Consolas, monospace; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Ribbon Layout Validation</h1>
  <div class="meta">Run: $timestamp · Cases: $Cases · Seed: $Seed · Project: $([System.Net.WebUtility]::HtmlEncode($projectDir))</div>
  <table>
    <thead>
      <tr>
        <th>Case</th>
        <th>Name</th>
        <th>Profile</th>
        <th>Groups</th>
        <th>Controls</th>
        <th>Columns</th>
        <th>Version</th>
        <th>Status</th>
        <th>Error</th>
        <th>Artifacts</th>
      </tr>
    </thead>
    <tbody>
      $($rows -join "`n")
    </tbody>
  </table>
</body>
</html>
"@

Set-Content -Path $reportPath -Value $html -Encoding UTF8

@{
    timestamp = $timestamp
    cases = $Cases
    seed = $Seed
    runDir = $runDir
    report = $reportPath
    results = $resultsPath
} | ConvertTo-Json -Depth 5 | Set-Content -Path $latestJsonPath -Encoding UTF8

Set-Content -Path $latestRunPath -Value $runDir -Encoding UTF8
Set-Content -Path $latestReportPath -Value $reportPath -Encoding UTF8

Write-Host "Validation run complete."
Write-Host "Report: $reportPath"
Write-Host "Results: $resultsPath"
