# YT Downloader - stazeni prenosnych binarek do slozky bin\ (Windows x64)
# Spousti se automaticky ze start.bat. Lze spustit i rucne:
#   powershell -ExecutionPolicy Bypass -File setup.ps1 [-Force]
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # vyrazne zrychli Invoke-WebRequest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$bin = Join-Path $root 'bin'
$tmp = Join-Path $env:TEMP ('ytd-setup-' + [guid]::NewGuid())
New-Item -ItemType Directory -Force -Path $bin, $tmp | Out-Null

function Need($exe, $cmd) {
  if ($Force) { return $true }
  if (Test-Path (Join-Path $bin $exe)) { return $false }
  if ($cmd -and (Get-Command $cmd -ErrorAction SilentlyContinue)) { return $false }
  return $true
}

try {
  if (Need 'yt-dlp.exe' 'yt-dlp') {
    Write-Host '-> yt-dlp ...'
    Invoke-WebRequest 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile (Join-Path $bin 'yt-dlp.exe')
  }

  if (Need 'ffmpeg.exe' 'ffmpeg') {
    Write-Host '-> ffmpeg (cca 100 MB) ...'
    $zip = Join-Path $tmp 'ffmpeg.zip'
    Invoke-WebRequest 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' -OutFile $zip
    Expand-Archive $zip -DestinationPath (Join-Path $tmp 'ffmpeg') -Force
    Get-ChildItem (Join-Path $tmp 'ffmpeg') -Recurse -Include 'ffmpeg.exe', 'ffprobe.exe' | Copy-Item -Destination $bin -Force
  }

  $hasNode = (Test-Path (Join-Path $bin 'node.exe'))
  if (-not $hasNode) {
    $sys = Get-Command node -ErrorAction SilentlyContinue
    if ($sys) { $v = (& node -v) -replace '^v(\d+).*', '$1'; if ([int]$v -ge 18) { $hasNode = $true } }
  }
  if ($Force -or -not $hasNode) {
    Write-Host '-> Node.js (prenosny) ...'
    $index = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
    $ver = ($index | Where-Object { $_.lts -ne $false } | Select-Object -First 1).version
    $zip = Join-Path $tmp 'node.zip'
    Invoke-WebRequest "https://nodejs.org/dist/$ver/node-$ver-win-x64.zip" -OutFile $zip
    Expand-Archive $zip -DestinationPath (Join-Path $tmp 'node') -Force
    Get-ChildItem (Join-Path $tmp 'node') -Recurse -Filter 'node.exe' | Select-Object -First 1 | Copy-Item -Destination $bin -Force
  }

  Write-Host 'Hotovo. Obsah bin\:'
  Get-ChildItem $bin -Filter *.exe | ForEach-Object { Write-Host ('   ' + $_.Name) }
}
catch {
  Write-Host ('CHYBA: ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
