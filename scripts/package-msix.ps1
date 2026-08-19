[CmdletBinding()]
param(
  [string]$ExecutablePath,
  [string]$PackageName,
  [string]$Publisher,
  [string]$PublisherDisplayName,
  [string]$Version,
  [string]$OutputPath,
  [string]$MakeAppxPath
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if (-not $ExecutablePath) {
  $ExecutablePath = Join-Path $repoRoot 'src-tauri\target\release\tournament-desk.exe'
}
if (-not $PackageName) {
  $PackageName = $env:MSIX_PACKAGE_NAME
}
if (-not $Publisher) {
  $Publisher = $env:MSIX_PUBLISHER
}
if (-not $PublisherDisplayName) {
  $PublisherDisplayName = $env:MSIX_PUBLISHER_DISPLAY_NAME
}
if (-not $Version) {
  $Version = $env:MSIX_VERSION
}
if (-not $OutputPath) {
  $OutputPath = $env:MSIX_OUTPUT_PATH
}
if (-not $MakeAppxPath) {
  $MakeAppxPath = $env:MAKEAPPX_PATH
}

if (-not $PackageName -or -not $Publisher -or -not $PublisherDisplayName) {
  throw 'MSIX_PACKAGE_NAME, MSIX_PUBLISHER, and MSIX_PUBLISHER_DISPLAY_NAME are required and must match Partner Center Product identity.'
}

$resolvedExecutable = Resolve-Path -LiteralPath $ExecutablePath -ErrorAction Stop
$packageJson = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'package.json') | ConvertFrom-Json
$tauriConfig = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'src-tauri\tauri.conf.json') | ConvertFrom-Json
$displayName = [string]$tauriConfig.productName
$description = [string]$tauriConfig.bundle.shortDescription
if (-not $description) {
  $description = 'Offline pickleball tournament operations desk'
}
if (-not $Version) {
  $Version = [string]$packageJson.version
}
if ($Version -match '^\d+\.\d+\.\d+$') {
  $Version = "$Version.0"
}
if ($Version -notmatch '^\d+\.\d+\.\d+\.\d+$') {
  throw "MSIX version must be a four-part numeric version, received '$Version'."
}

if (-not $MakeAppxPath) {
  $windowsKitBin = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
  $makeAppx = Get-ChildItem -LiteralPath $windowsKitBin -Recurse -Filter 'makeappx.exe' -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Directory.Name -eq 'x64' } |
    Sort-Object FullName -Descending |
    Select-Object -First 1
  if ($makeAppx) {
    $MakeAppxPath = $makeAppx.FullName
  }
}
$resolvedMakeAppx = Resolve-Path -LiteralPath $MakeAppxPath -ErrorAction Stop

$bundleRoot = Join-Path $repoRoot 'src-tauri\target\release\bundle'
$stageRoot = Join-Path $bundleRoot ("msix-stage-$Version")
if (-not $OutputPath) {
  $OutputPath = Join-Path $bundleRoot ("msix\Tournament-Desk_${Version}_x64.msix")
}
$resolvedOutput = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
  [System.IO.Path]::GetFullPath($OutputPath)
} else {
  [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $OutputPath))
}

if (Test-Path -LiteralPath $stageRoot) {
  Remove-Item -LiteralPath $stageRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageRoot 'Assets') -Force | Out-Null
New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($resolvedOutput)) -Force | Out-Null

$executableFile = Get-Item -LiteralPath $resolvedExecutable.Path
Copy-Item -LiteralPath $executableFile.FullName -Destination (Join-Path $stageRoot $executableFile.Name)

$runtimeExtensions = @('.dll', '.json', '.dat', '.pdb')
Get-ChildItem -LiteralPath $executableFile.DirectoryName -File |
  Where-Object { $_.FullName -ne $executableFile.FullName -and $runtimeExtensions -contains $_.Extension.ToLowerInvariant() } |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $stageRoot $_.Name) }

$resourceDirectory = Join-Path $executableFile.DirectoryName 'resources'
if (Test-Path -LiteralPath $resourceDirectory) {
  Copy-Item -LiteralPath $resourceDirectory -Destination $stageRoot -Recurse
}

$iconSource = Join-Path $repoRoot 'src-tauri\icons'
foreach ($iconName in @('StoreLogo.png', 'Square150x150Logo.png', 'Square44x44Logo.png')) {
  $iconPath = Join-Path $iconSource $iconName
  if (-not (Test-Path -LiteralPath $iconPath)) {
    throw "Required Store icon was not found: $iconPath"
  }
  Copy-Item -LiteralPath $iconPath -Destination (Join-Path $stageRoot "Assets\$iconName")
}

function Escape-Xml([string]$value) {
  return [System.Security.SecurityElement]::Escape($value)
}

$manifest = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'packaging\msix\AppxManifest.xml')
$manifest = $manifest.Replace('{{PACKAGE_NAME}}', (Escape-Xml $PackageName))
$manifest = $manifest.Replace('{{PUBLISHER}}', (Escape-Xml $Publisher))
$manifest = $manifest.Replace('{{PUBLISHER_DISPLAY_NAME}}', (Escape-Xml $PublisherDisplayName))
$manifest = $manifest.Replace('{{DISPLAY_NAME}}', (Escape-Xml $displayName))
$manifest = $manifest.Replace('{{DESCRIPTION}}', (Escape-Xml $description))
$manifest = $manifest.Replace('{{VERSION}}', (Escape-Xml $Version))
$manifest = $manifest.Replace('{{EXECUTABLE}}', (Escape-Xml $executableFile.Name))
$manifestPath = Join-Path $stageRoot 'AppxManifest.xml'
[System.IO.File]::WriteAllText($manifestPath, $manifest, (New-Object System.Text.UTF8Encoding($false)))

if (Test-Path -LiteralPath $resolvedOutput) {
  Remove-Item -LiteralPath $resolvedOutput -Force
}
& $resolvedMakeAppx.Path pack /d $stageRoot /p $resolvedOutput /o /h SHA256
if ($LASTEXITCODE -ne 0) {
  throw "MakeAppx failed with exit code $LASTEXITCODE."
}

$outputFile = Get-Item -LiteralPath $resolvedOutput
$hash = Get-FileHash -LiteralPath $outputFile.FullName -Algorithm SHA256
[pscustomobject]@{
  Package = $outputFile.FullName
  Bytes = $outputFile.Length
  SHA256 = $hash.Hash
  PackageName = $PackageName
  Publisher = $Publisher
  Version = $Version
  Signed = $false
}
