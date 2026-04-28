param(
    [string]$InputJson = (Join-Path $PSScriptRoot '..\arcgis-pro-validation\GisProRibbonLayoutValidator.AddIn\Layout\current-layout.json'),
    [string]$ProjectDir = (Join-Path $PSScriptRoot '..\arcgis-pro-validation\GisProRibbonLayoutValidator.AddIn'),
    [string]$Version
)

$generator = Join-Path $PSScriptRoot 'generate-arcgis-pro-validation.mts'

if (-not (Test-Path $InputJson)) {
    throw "Layout JSON not found: $InputJson"
}

$generatorArgs = @('--input', $InputJson, '--project-dir', $ProjectDir)
if ($Version) {
    $generatorArgs += @('--version', $Version)
}

node --experimental-strip-types $generator @generatorArgs
if ($LASTEXITCODE -ne 0) {
    throw "ArcGIS Pro validation artifact generation failed with exit code $LASTEXITCODE"
}
