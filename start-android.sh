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

# 0) Server už běží (druhé klepnutí na ikonu) → jen otevřít aplikaci, nespouštět druhý server
if command -v python >/dev/null 2>&1; then
  PORT="$(python -c 'import json,sys
try: print(int(json.load(open(sys.argv[1])).get("port", 8000)))
except Exception: print(8000)' config.json)"
  if python -c 'import sys,urllib.request
try: urllib.request.urlopen("http://127.0.0.1:%s/api/status" % sys.argv[1], timeout=1); sys.exit(0)
except Exception: sys.exit(1)' "$PORT"; then
    echo "Server už běží – otevírám aplikaci."
    [ -n "$OPEN" ] && termux-open-url "http://localhost:$PORT/"
    exit 0
  fi
fi

# 1) Chybějící balíčky (jen poprvé)
# Programy se zkusí opravdu spustit – nestačí, že existují (po neúplné instalaci mohou jít „rozbité“).
need=()
node --version >/dev/null 2>&1 || need+=(nodejs-lts)
ffmpeg -version >/dev/null 2>&1 || need+=(ffmpeg)
python --version >/dev/null 2>&1 || need+=(python)
if [ ${#need[@]} -gt 0 ]; then
  echo "Instaluji: ${need[*]} (jen poprvé, může to trvat několik minut)…"
  # Nejdřív aktualizovat celý systém. Instalace nových balíčků do zastaralého Termuxu
  # končí chybou „CANNOT LINK EXECUTABLE“ (nové balíčky potřebují novější knihovny).
  # Na případné dotazy ohledně konfiguračních souborů stačí odpovědět Enter.
  pkg upgrade -y
  pkg install -y "${need[@]}"
  if ! ffmpeg -version >/dev/null 2>&1 || ! node --version >/dev/null 2>&1; then
    echo
    echo "Instalace se nepovedla. Zkuste: pkg upgrade -y   a pak znovu: bash $APP_DIR/start-android.sh"
    exit 1
  fi
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

# 3) Ikona na plochu přes Termux:Widget (soubor ~/.shortcuts/YT Downloader + ikona)
SHORTCUT="$HOME/.shortcuts/YT Downloader"
mkdir -p "$HOME/.shortcuts/icons"
chmod 700 "$HOME/.shortcuts"
if [ ! -e "$SHORTCUT" ] || grep -q "YT-DOWNLOADER-SHORTCUT" "$SHORTCUT"; then
  {
    echo '#!/data/data/com.termux/files/usr/bin/bash'
    echo '# YT-DOWNLOADER-SHORTCUT – vytvořeno skriptem start-android.sh'
    printf 'exec bash %q\n' "$APP_DIR/start-android.sh"
  } > "$SHORTCUT"
  chmod 700 "$SHORTCUT"
  cp public/icons/icon-192.png "$HOME/.shortcuts/icons/YT Downloader.png"
fi

# 4) Aby Android server neuspal při zhasnutém displeji
termux-wake-lock 2>/dev/null || true
trap 'termux-wake-unlock 2>/dev/null || true' EXIT

node server/index.js $OPEN $MODE
