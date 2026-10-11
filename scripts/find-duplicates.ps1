<#
.SYNOPSIS
  Finds byte-identical gallery folders. Run with `npm run galleries:duplicates`.

.DESCRIPTION
  For every folder in public/galleries, SHA-256 hashes every supported image.
  Folders whose complete sorted lists of image hashes match are written to
  data/duplicates.json as a group: the alphabetically first folder is the
  root, the others are its duplicates.

  Filenames and image order do not matter; repeated-image counts do.
  `npm run galleries:prepare` independently verifies every image in each group
  before merging anything. No folders or files are changed.
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

function Get-ContentSignature([string[]]$Hashes) {
  [System.Array]::Sort($Hashes, [System.StringComparer]::Ordinal)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($Hashes -join "`n"))
    [System.BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
  } finally {
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

  $hashes = New-Object System.Collections.Generic.List[string]
  foreach ($image in $images) {
    try {
      $hashes.Add((Get-Sha256 $image.FullName))
    } catch {
      $unreadable.Add([pscustomobject]@{ folder = $folder.Name; file = $image.Name; error = $_.Exception.Message })
    }
  }
  if ($hashes.Count -ne $images.Count) { continue }

  $scanned.Add([pscustomobject]@{
      Folder     = $folder.Name
      ImageCount = $images.Count
      Signature  = Get-ContentSignature $hashes.ToArray()
    })
}

$groups = New-Object System.Collections.Generic.List[object]
foreach ($set in ($scanned | Group-Object Signature | Where-Object Count -gt 1)) {
  $members = @($set.Group | Sort-Object Folder)
  $groups.Add([pscustomobject]@{
      root          = $members[0].Folder
      duplicates    = @($members | Select-Object -Skip 1 | ForEach-Object Folder)
      imageCount    = $members[0].ImageCount
      contentSha256 = $set.Name
    })
}

$sortedGroups = New-Object System.Collections.Generic.List[object]
foreach ($g in ($groups | Sort-Object root)) { $sortedGroups.Add($g) }

$result = [pscustomobject]@{
  version         = 1
  generatedAt     = (Get-Date).ToUniversalTime().ToString('o')
  method          = 'Exact duplicates: SHA-256 of every image, sorted independently of filenames and image order, preserving repeated-image counts. Independently reverified by galleries:prepare.'
  foldersScanned  = $folders.Count
  groups          = $sortedGroups.ToArray()
  emptyFolders    = $emptyFolders.ToArray()
  unreadable      = $unreadable.ToArray()
}

$outDir = Split-Path -Parent $OutFile
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
$json = ConvertTo-Json -InputObject $result -Depth 6
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($OutFile), $json, (New-Object System.Text.UTF8Encoding($false)))

$duplicateFolders = ($groups | ForEach-Object { $_.duplicates.Count } | Measure-Object -Sum).Sum
if (-not $duplicateFolders) { $duplicateFolders = 0 }
Write-Host ("[duplicates] {0} folders scanned: {1} exact duplicate groups ({2} duplicate folders), {3} empty, {4} unreadable images" -f `
    $folders.Count, $groups.Count, $duplicateFolders, $emptyFolders.Count, $unreadable.Count)
Write-Host "[duplicates] Wrote $([System.IO.Path]::GetFullPath($OutFile))"
Write-Host '[duplicates] Next: npm run galleries:prepare (verifies every image before merging)'
if ($unreadable.Count -gt 0) {
  Write-Error "Duplicate scan is incomplete; unreadable images are listed in the output. First error: $($unreadable[0].error)"
  exit 1
}
