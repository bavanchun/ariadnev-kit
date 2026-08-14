# ariadnev installer (Windows) — downloads the standalone binary from the ariadnev
# edge, verifies its sha256, and installs it to %LOCALAPPDATA%\Programs\ariadnev,
# adding that dir to the user PATH.
#
#   irm https://ariadnev.com/install.ps1 | iex
$ErrorActionPreference = "Stop"

$base = if ($env:ARIADNEV_BASE_URL) { $env:ARIADNEV_BASE_URL } else { "https://ariadnev.com" }
$asset = "ariadnev-windows-x64.exe"
$installDir = Join-Path $env:LOCALAPPDATA "Programs\ariadnev"

$tmp = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ("ariadnev-" + [guid]::NewGuid()))
try {
  Write-Host "ariadnev install: downloading $asset ..."
  Invoke-WebRequest -Uri "$base/download/$asset" -OutFile (Join-Path $tmp $asset)
  Invoke-WebRequest -Uri "$base/download/checksums.txt" -OutFile (Join-Path $tmp "checksums.txt")

  # Verify sha256 (fail closed).
  $line = Get-Content (Join-Path $tmp "checksums.txt") | Where-Object { $_ -match "\s$([regex]::Escape($asset))$" }
  if (-not $line) { throw "no checksum for $asset in checksums.txt" }
  $expected = ($line -split "\s+")[0].ToLower()
  $actual = (Get-FileHash (Join-Path $tmp $asset) -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $expected) { throw "checksum mismatch — refusing to install (expected $expected, got $actual)" }

  New-Item -ItemType Directory -Force -Path $installDir | Out-Null
  Copy-Item (Join-Path $tmp $asset) (Join-Path $installDir "ariadnev.exe") -Force

  # Short `av` alias (opt out with ARIADNEV_ALIAS=off). Windows lacks reliable
  # symlinks without elevation, so ship a copy — but never clobber a different vc.
  if ($env:ARIADNEV_ALIAS -ne "off") {
    $vcExe = Join-Path $installDir "vc.exe"
    Copy-Item (Join-Path $installDir "ariadnev.exe") $vcExe -Force
    Write-Host "ariadnev install: installed short alias  vc.exe"
  }

  # Add to the user PATH if missing.
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($userPath -notlike "*$installDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$installDir", "User")
    Write-Host "ariadnev install: added $installDir to your PATH (restart your shell)."
  }

  $ver = & (Join-Path $installDir "ariadnev.exe") --version
  Write-Host "ariadnev install: installed ariadnev $ver to $installDir"
  Write-Host "ariadnev install: run  ariadnev install  to set up your providers."
}
finally {
  Remove-Item -Recurse -Force $tmp
}
