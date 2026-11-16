#!/bin/bash
# YT Downloader – spouštěcí soubor pro macOS (dvojklik ve Finderu). Funguje i na Linuxu: ./start.command
cd "$(dirname "$0")" || exit 1

need_setup=0
[ -x bin/yt-dlp ] || [ -x bin/yt-dlp_macos ] || command -v yt-dlp >/dev/null 2>&1 || need_setup=1
[ -x bin/ffmpeg ] || command -v ffmpeg >/dev/null 2>&1 || need_setup=1
[ -x bin/node ] || command -v node >/dev/null 2>&1 || need_setup=1

if [ "$need_setup" = 1 ]; then
  echo "Chybí některé programy, stahuji je do složky bin/ …"
  if ! bash ./setup.sh; then
    echo
    echo "Setup selhal. Viz README.md, část „Ruční instalace binárek“."
    read -r -p "Stiskněte Enter pro zavření…" _
    exit 1
  fi
fi

NODE=bin/node
[ -x "$NODE" ] || NODE=node

"$NODE" server/index.js --open
echo
echo "Server byl ukončen."
read -r -p "Stiskněte Enter pro zavření…" _
