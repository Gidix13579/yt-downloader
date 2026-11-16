#!/bin/bash
# YT Downloader – stažení přenosných binárek (yt-dlp, ffmpeg, ffprobe, node) do složky bin/.
# macOS (Apple Silicon i Intel) a Linux x64/arm64. Spouští se automaticky ze start.command.
#   bash setup.sh          – stáhne jen to, co chybí
#   bash setup.sh --force  – stáhne vše znovu
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p bin
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
FORCE=0; [ "${1:-}" = "--force" ] && FORCE=1

OS="$(uname -s)"; ARCH="$(uname -m)"
case "$ARCH" in arm64|aarch64) ARCH=arm64 ;; x86_64|amd64) ARCH=x64 ;; *) echo "Nepodporovaná architektura: $ARCH"; exit 1 ;; esac

need() { # need <soubor v bin> <příkaz v systému>
  [ "$FORCE" = 1 ] && return 0
  [ -x "bin/$1" ] && return 1
  [ -n "${2:-}" ] && command -v "$2" >/dev/null 2>&1 && return 1
  return 0
}
dl() { echo "   $1"; curl -fL --retry 3 --progress-bar -o "$2" "$1"; }

if need yt-dlp yt-dlp; then
  echo "-> yt-dlp"
  if [ "$OS" = Darwin ]; then dl https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos bin/yt-dlp
  elif [ "$ARCH" = arm64 ]; then dl https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64 bin/yt-dlp
  else dl https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux bin/yt-dlp; fi
  chmod +x bin/yt-dlp
fi

if need ffmpeg ffmpeg; then
  echo "-> ffmpeg + ffprobe"
  if [ "$OS" = Darwin ]; then
    A=$([ "$ARCH" = arm64 ] && echo arm64 || echo amd64)
    for t in ffmpeg ffprobe; do
      # Primárně nativní build (martin-riedl.de), záložně Intel build z evermeet.cx (na Apple Silicon běží přes Rosettu).
      dl "https://ffmpeg.martin-riedl.de/redirect/latest/macos/$A/release/$t.zip" "$TMP/$t.zip" \
        || dl "https://evermeet.cx/ffmpeg/getrelease/$t/zip" "$TMP/$t.zip"
      unzip -o -q "$TMP/$t.zip" -d "$TMP/$t"
      find "$TMP/$t" -type f -name "$t" -exec cp {} bin/ \;
    done
  else
    A=$([ "$ARCH" = arm64 ] && echo linuxarm64 || echo linux64)
    dl "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-$A-gpl.tar.xz" "$TMP/ff.tar.xz"
    tar -xJf "$TMP/ff.tar.xz" -C "$TMP"
    find "$TMP" -type f \( -name ffmpeg -o -name ffprobe \) -path '*/bin/*' -exec cp {} bin/ \;
  fi
  chmod +x bin/ffmpeg bin/ffprobe
fi

node_ok() { command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; }
if [ "$FORCE" = 1 ] || { [ ! -x bin/node ] && ! node_ok; }; then
  echo "-> Node.js (přenosný)"
  curl -fsSL -o "$TMP/index.json" https://nodejs.org/dist/index.json
  VER="$(tr '{' '\n' < "$TMP/index.json" | grep -v '"lts":false' | grep -o '"version":"v[0-9.]*"' | sed -n 1p | cut -d'"' -f4 || true)"
  [ -n "$VER" ] || { echo "Nepodařilo se zjistit verzi Node.js"; exit 1; }
  P=$([ "$OS" = Darwin ] && echo darwin || echo linux)
  dl "https://nodejs.org/dist/$VER/node-$VER-$P-$ARCH.tar.gz" "$TMP/node.tgz"
  tar -xzf "$TMP/node.tgz" -C "$TMP"
  cp "$TMP/node-$VER-$P-$ARCH/bin/node" bin/node
  chmod +x bin/node
fi

# macOS: odstranit karanténu, aby Gatekeeper neblokoval spuštění stažených binárek
if [ "$OS" = Darwin ]; then xattr -dr com.apple.quarantine bin 2>/dev/null || true; fi

echo "Hotovo. Obsah bin/:"
ls -1 bin | sed 's/^/   /'
