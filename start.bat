@echo off
rem YT Downloader - spousteci soubor pro Windows
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title YT Downloader

rem Chybejici binarky (node, yt-dlp, ffmpeg) stahne setup.ps1 do slozky bin\
set NEED_SETUP=
if not exist "bin\yt-dlp.exe" (
  where yt-dlp >nul 2>nul || set NEED_SETUP=1
)
if not exist "bin\ffmpeg.exe" (
  where ffmpeg >nul 2>nul || set NEED_SETUP=1
)
if not exist "bin\node.exe" (
  where node >nul 2>nul || set NEED_SETUP=1
)
if defined NEED_SETUP (
  echo Chybi nektere programy, stahuji je do slozky bin\ ...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
  if errorlevel 1 (
    echo.
    echo Setup selhal. Viz README.md, cast "Rucni instalace binarek".
    pause
    exit /b 1
  )
)

set "NODE=bin\node.exe"
if not exist "%NODE%" set "NODE=node"

"%NODE%" server\index.js --open
echo.
echo Server byl ukoncen.
pause
