<#
.SYNOPSIS
  Finds candidate duplicate gallery folders. Run with `npm run galleries:duplicates`.

.DESCRIPTION
  For every folder in public/galleries, takes the first supported image in
  natural filename order, SHA-256 hashes it and counts the folder's images.
  Folders whose first image AND image count match are written to
  data/duplicates.json as a group: the alphabetically first folder is the
  root, the others are its duplicates.

  These are candidates only. `npm run galleries:prepare` verifies every image
  in each group before merging anything. No folders or files are changed.
#>
[CmdletBinding()]
param(
  [string]$GalleriesDir,
  [string]$OutFile
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $GalleriesDir) { $GalleriesDir = Join-Path $repoRoot 'public\galleries' }
if (-not $OutFile) { $OutFile = Join-Path $repoRoot 'data\duplicates.json' }
$imageExt = @('.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg')

function Get-NaturalKey([string]$Name) {
  [regex]::Replace($Name.ToLowerInvariant(), '\d+', { param($m) $m.Value.PadLeft(20, '0') })
}

function Get-Sha256([string]$Path) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
  } finally {
    $stream.Dispose()
    $sha.Dispose()
  }
}

if (-not (Test-Path -LiteralPath $GalleriesDir -PathType Container)) {
  throw "Gallery folder not found: $GalleriesDir"
}

$folders = @(Get-ChildItem -LiteralPath $GalleriesDir -Directory | Sort-Object Name)
$scanned = New-Object System.Collections.Generic.List[object]
$emptyFolders = New-Object System.Collections.Generic.List[string]
$unreadable = New-Object System.Collections.Generic.List[object]

$i = 0
foreach ($folder in $folders) {
  $i++
  if ($i % 200 -eq 0) { Write-Host "[duplicates] $i/$($folders.Count) folders" }

  $images = @(Get-ChildItem -LiteralPath $folder.FullName -File |
      Where-Object { $imageExt -contains $_.Extension.ToLowerInvariant() })
  if ($images.Count -eq 0) {
    $emptyFolders.Add($folder.Name)
    continue
  }

  $first = $images | Sort-Object { Get-NaturalKey $_.Name } | Select-Object -First 1
  try {
    $hash = Get-Sha256 $first.FullName
  } catch {
    $unreadable.Add([pscustomobject]@{ folder = $folder.Name; file = $first.Name; error = $_.Exception.Message })
    continue
  }

  $scanned.Add([pscustomobject]@{
      Folder     = $folder.Name
      ImageCount = $images.Count
      FirstImage = $first.Name
      Sha256     = $hash
    })
}

$groups = New-Object System.Collections.Generic.List[object]
$countMismatches = New-Object System.Collections.Generic.List[object]

foreach ($byHash in ($scanned | Group-Object Sha256 | Where-Object Count -gt 1)) {
  $byCount = @($byHash.Group | Group-Object ImageCount)
  foreach ($set in ($byCount | Where-Object Count -gt 1)) {
    $members = @($set.Group | Sort-Object Folder)
    $groups.Add([pscustomobject]@{
        root          = $members[0].Folder
        duplicates    = @($members | Select-Object -Skip 1 | ForEach-Object Folder)
        imageCount    = [int]$set.Name
        firstImageSha256 = $byHash.Name
      })
  }
  if ($byCount.Count -gt 1) {
    $countMismatches.Add([pscustomobject]@{
        firstImageSha256 = $byHash.Name
        folders          = @($byHash.Group | Sort-Object Folder | ForEach-Object {
            [pscustomobject]@{ folder = $_.Folder; imageCount = $_.ImageCount }
          })
      })
  }
}

$sortedGroups = New-Object System.Collections.Generic.List[object]
foreach ($g in ($groups | Sort-Object root)) { $sortedGroups.Add($g) }

$result = [pscustomobject]@{
  version         = 1
  generatedAt     = (Get-Date).ToUniversalTime().ToString('o')
  method          = 'Candidates: first image (natural filename order) has the same SHA-256 and the folders have the same image count. Verified in full by galleries:prepare.'
  foldersScanned  = $folders.Count
  groups          = $sortedGroups.ToArray()
  countMismatches = $countMismatches.ToArray()
  emptyFolders    = $emptyFolders.ToArray()
  unreadable      = $unreadable.ToArray()
}

$outDir = Split-Path -Parent $OutFile
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$json = ConvertTo-Json -InputObject $result -Depth 6
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($OutFile), $json, (New-Object System.Text.UTF8Encoding($false)))

$duplicateFolders = ($groups | ForEach-Object { $_.duplicates.Count } | Measure-Object -Sum).Sum
if (-not $duplicateFolders) { $duplicateFolders = 0 }
Write-Host ("[duplicates] {0} folders scanned: {1} candidate groups ({2} duplicate folders), {3} first-image matches with different counts, {4} empty, {5} unreadable" -f `
    $folders.Count, $groups.Count, $duplicateFolders, $countMismatches.Count, $emptyFolders.Count, $unreadable.Count)
Write-Host "[duplicates] Wrote $([System.IO.Path]::GetFullPath($OutFile))"
Write-Host '[duplicates] Next: npm run galleries:prepare (verifies every image before merging)'
if ($scanned.Count -eq 0 -and $unreadable.Count -gt 0) {
  Write-Error "No folder could be read; first error: $($unreadable[0].error)"
  exit 1
}
