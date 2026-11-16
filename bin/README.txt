Sem patří přenosné binárky. Setup (start.bat / start.command) je stáhne sám.

Ručně:
  Windows: yt-dlp.exe, ffmpeg.exe, ffprobe.exe, node.exe
    yt-dlp: https://github.com/yt-dlp/yt-dlp/releases/latest  (yt-dlp.exe)
    ffmpeg: https://github.com/BtbN/FFmpeg-Builds/releases     (ffmpeg-master-latest-win64-gpl.zip → bin\*.exe)
    node:   https://nodejs.org/en/download                     (Windows Binary .zip → node.exe)
  macOS:   yt-dlp, ffmpeg, ffprobe, node   (chmod +x, pak: xattr -dr com.apple.quarantine bin)
    yt-dlp: https://github.com/yt-dlp/yt-dlp/releases/latest  (yt-dlp_macos → přejmenovat na yt-dlp)
    ffmpeg: https://ffmpeg.martin-riedl.de  nebo  https://evermeet.cx/ffmpeg
    node:   https://nodejs.org/en/download                     (macOS Binary .tar.gz → bin/node)

Když tu binárka chybí, aplikace použije tu ze systému (PATH).
