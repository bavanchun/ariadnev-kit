# vcskill installer (Windows) — downloads the standalone binary from the vcskill
# edge, verifies its sha256, and installs it to %LOCALAPPDATA%\Programs\vcskill,
# adding that dir to the user PATH.
#
#   irm https://vcskill.vchun.dev/install.ps1 | iex
$ErrorActionPreference = "Stop"

$base = if ($env:VCSKILL_BASE_URL) { $env:VCSKILL_BASE_URL } else { "https://vcskill.vchun.dev" }
$asset = "vcskill-windows-x64.exe"
$installDir = Join-Path $env:LOCALAPPDATA "Programs\vcskill"

$tmp = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ("vcskill-" + [guid]::NewGuid()))
try {
  Write-Host "vcskill install: downloading $asset ..."
  Invoke-WebRequest -Uri "$base/download/$asset" -OutFile (Join-Path $tmp $asset)
  Invoke-WebRequest -Uri "$base/download/checksums.txt" -OutFile (Join-Path $tmp "checksums.txt")

  # Verify sha256 (fail closed).
  $line = Get-Content (Join-Path $tmp "checksums.txt") | Where-Object { $_ -match "\s$([regex]::Escape($asset))$" }
  if (-not $line) { throw "no checksum for $asset in checksums.txt" }
  $expected = ($line -split "\s+")[0].ToLower()
  $actual = (Get-FileHash (Join-Path $tmp $asset) -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $expected) { throw "checksum mismatch — refusing to install (expected $expected, got $actual)" }

  New-Item -ItemType Directory -Force -Path $installDir | Out-Null
  Copy-Item (Join-Path $tmp $asset) (Join-Path $installDir "vcskill.exe") -Force

  # Add to the user PATH if missing.
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($userPath -notlike "*$installDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$installDir", "User")
    Write-Host "vcskill install: added $installDir to your PATH (restart your shell)."
  }

  $ver = & (Join-Path $installDir "vcskill.exe") --version
  Write-Host "vcskill install: installed vcskill $ver to $installDir"
  Write-Host "vcskill install: run  vcskill install  to set up your providers."
}
finally {
  Remove-Item -Recurse -Force $tmp
}
