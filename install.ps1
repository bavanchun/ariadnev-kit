# ariadnev installer (Windows) — downloads the standalone binary from the ariadnev
# edge, verifies its sha256, and installs it to %LOCALAPPDATA%\Programs\ariadnev,
# adding that dir to the user PATH.
#
#   irm https://ariadnev.com/install.ps1 | iex
#
# Overrides (env):
#   ARIADNEV_ALIAS=off               skip the short alias
#   ARIADNEV_BASE_URL                fetch the binary from another host (mirror,
#                                    staging, local). checksums.txt still comes
#                                    from the canonical domain.
#   ARIADNEV_ALLOW_UNVERIFIED_BASE=1 also take checksums.txt from that host.
#                                    Deliberate staging/offline testing only.
$ErrorActionPreference = "Stop"
# `irm | iex` runs in the caller's session and inherits its preferences. A
# profile with $WarningPreference = 'SilentlyContinue' would swallow the
# unverified-binary warning below — the only thing standing between the opt-out
# and a silent unverified install.
$WarningPreference = "Continue"

$defaultBase = "https://ariadnev.com"
$base = if ($env:ARIADNEV_BASE_URL) { $env:ARIADNEV_BASE_URL } else { $defaultBase }

# checksums.txt is the only thing that authenticates the binary, so it must not
# come from a host the caller can redirect. Otherwise whoever sets one env var
# serves both the payload and the hash that "verifies" it, and the check below
# proves nothing. Opting out is possible but has to be said out loud.
$checksumBase = if ($env:ARIADNEV_ALLOW_UNVERIFIED_BASE -eq "1") { $base } else { $defaultBase }

$asset = "ariadnev-windows-x64.exe"
$installDir = Join-Path $env:LOCALAPPDATA "Programs\ariadnev"

$tmp = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ("ariadnev-" + [guid]::NewGuid()))
try {
  if ($base -ne $defaultBase) {
    if ($checksumBase -eq $base) {
      Write-Warning "ariadnev install: binary and checksums.txt both come from $base."
      Write-Warning "ariadnev install: the checksum cannot authenticate this binary. Unset ARIADNEV_ALLOW_UNVERIFIED_BASE unless you meant this."
    } else {
      Write-Host "ariadnev install: binary from $base; checksums.txt from $defaultBase."
    }
  }

  Write-Host "ariadnev install: downloading $asset ..."
  Invoke-WebRequest -Uri "$base/download/$asset" -OutFile (Join-Path $tmp $asset)
  Invoke-WebRequest -Uri "$checksumBase/download/checksums.txt" -OutFile (Join-Path $tmp "checksums.txt")

  # Verify sha256 (fail closed). -cmatch, and exactly one line: -match is
  # case-insensitive and Where-Object returns every hit, so a lax filter would
  # silently take the first of several hashes for "the same" asset. install.sh
  # fails closed on both; match that.
  $lines = @(Get-Content (Join-Path $tmp "checksums.txt") | Where-Object { $_ -cmatch "\s$([regex]::Escape($asset))$" })
  if ($lines.Count -ne 1) {
    throw "expected exactly one checksum line for $asset in checksums.txt from $checksumBase, found $($lines.Count)"
  }
  $expected = ($lines[0] -split "\s+")[0].ToLower()
  $actual = (Get-FileHash (Join-Path $tmp $asset) -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $expected) { throw "checksum mismatch — refusing to install (expected $expected, got $actual)" }

  New-Item -ItemType Directory -Force -Path $installDir | Out-Null
  Copy-Item (Join-Path $tmp $asset) (Join-Path $installDir "ariadnev.exe") -Force

  # Short `av` alias (opt out with ARIADNEV_ALIAS=off). Windows lacks reliable
  # symlinks without elevation, so ship a copy. Overwriting is safe here in a way
  # it is not in install.sh: this directory belongs to ariadnev and was created
  # above, whereas ~/.local/bin is shared with every other tool, which is why the
  # shell installer guards the name and this one does not.
  if ($env:ARIADNEV_ALIAS -ne "off") {
    $avExe = Join-Path $installDir "av.exe"
    Copy-Item (Join-Path $installDir "ariadnev.exe") $avExe -Force
    Write-Host "ariadnev install: installed short alias  av.exe"
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
