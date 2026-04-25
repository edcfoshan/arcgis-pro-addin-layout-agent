param(
    [string]$InputJson = (Join-Path $PSScriptRoot '..\arcgis-pro-validation\GisProRibbonLayoutValidator.AddIn\Layout\current-layout.json'),
    [string]$ProjectDir = (Join-Path $PSScriptRoot '..\arcgis-pro-validation\GisProRibbonLayoutValidator.AddIn')
)

$generator = Join-Path $PSScriptRoot 'generate-arcgis-pro-validation.mts'

if (-not (Test-Path $InputJson)) {
    throw "Layout JSON not found: $InputJson"
}

node --experimental-strip-types $generator --input $InputJson --project-dir $ProjectDir
