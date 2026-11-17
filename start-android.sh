#!/data/data/com.termux/files/usr/bin/bash
# YT Downloader – spuštění na Androidu v aplikaci Termux (https://f-droid.org/packages/com.termux/)
#
#   bash start-android.sh            – jen pro tento telefon (výchozí, bezpečné i ve veřejné Wi-Fi)
#   bash start-android.sh --lan      – zpřístupnit i dalším zařízením ve Wi-Fi / Tailscale
#   bash start-android.sh --no-open  – neotevírat prohlížeč (používá sdílení z YouTube)
set -e
cd "$(dirname "$0")"
APP_DIR="$(pwd)"

if [[ "${PREFIX:-}" != *com.termux* ]]; then
  echo "Tento skript je pro Android v aplikaci Termux. Na počítači použijte start.command / start.bat."
  exit 1
fi

MODE="--local"; OPEN="--open"
for a in "$@"; do
  case "$a" in
    --lan) MODE="" ;;
    --no-open) OPEN="" ;;
  esac
done

# 1) Chybějící balíčky (jen poprvé)
need=()
command -v node >/dev/null 2>&1 || need+=(nodejs-lts)
command -v ffmpeg >/dev/null 2>&1 || need+=(ffmpeg)
command -v python >/dev/null 2>&1 || need+=(python)
if [ ${#need[@]} -gt 0 ]; then
  echo "Instaluji: ${need[*]} (jen poprvé, může to trvat několik minut)…"
  pkg update -y
  pkg install -y "${need[@]}"
fi
if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "Instaluji yt-dlp…"
  python -m pip install -U yt-dlp yt-dlp-ejs mutagen
fi

# 2) Sdílení z aplikace YouTube → Termux (soubor ~/bin/termux-url-opener)
mkdir -p "$HOME/bin"
OPENER="$HOME/bin/termux-url-opener"
if [ ! -e "$OPENER" ] || grep -q "YT-DOWNLOADER-OPENER" "$OPENER"; then
  # Cesta k aplikaci se vloží do šablony (bez interpretace jako regulární výraz).
  python -c 'import sys; t=open(sys.argv[1]).read(); open(sys.argv[2],"w").write(t.replace("__APP_DIR__", sys.argv[3]))' \
    android/termux-url-opener "$OPENER" "$APP_DIR"
  chmod +x "$OPENER"
else
  echo "Pozn.: ~/bin/termux-url-opener už existuje a není náš – sdílení z YouTube nenastavuji."
fi

# 3) Aby Android server neuspal při zhasnutém displeji
termux-wake-lock 2>/dev/null || true
trap 'termux-wake-unlock 2>/dev/null || true' EXIT

node server/index.js $OPEN $MODE
