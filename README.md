# YT Downloader

Webová aplikace pro stahování videí a zvuku z YouTube. Běží na vašem počítači a otevřete ji i z telefonu ve stejné Wi-Fi.
Používá [yt-dlp](https://github.com/yt-dlp/yt-dlp) a [ffmpeg](https://ffmpeg.org/). Nic se neinstaluje do systému, všechno je v jedné přenosné složce.

> Stahujte jen obsah, ke kterému máte práva: vlastní videa, obsah pod licencí Creative Commons nebo s povolením autora.

## Spuštění

### Windows
1. Rozbalte složku kamkoli (např. `Dokumenty\yt-downloader`).
2. Dvakrát klikněte na **`start.bat`**.
   - Při prvním spuštění se do složky `bin\` stáhnou chybějící programy: yt-dlp, ffmpeg a přenosný Node.js (asi 150 MB, jednorázově).
   - Windows SmartScreen může varovat („Systém Windows ochránil váš počítač“). Klikněte na **Další informace → Přesto spustit**.
3. Otevře se prohlížeč s aplikací. V černém okně je adresa pro telefon a QR kód.

### macOS
1. Rozbalte složku (např. do `Dokumenty`).
2. Dvakrát klikněte na **`start.command`**.
   - Když macOS hlásí, že soubor nelze otevřít (neověřený vývojář): **pravé tlačítko → Otevřít → Otevřít**.
     Případně v Terminálu: `xattr -dr com.apple.quarantine ~/Dokumenty/yt-downloader`
   - Když se soubor otevře v textovém editoru, chybí mu oprávnění ke spuštění. V Terminálu spusťte `chmod +x start.command setup.sh`.
   - Při prvním spuštění se binárky stáhnou do `bin/` (podporované jsou Apple Silicon i Intel).
3. Otevře se prohlížeč. V okně Terminálu je adresa pro telefon a QR kód.

Server ukončíte zavřením okna nebo klávesami **Ctrl+C**.

## Otevření z telefonu

1. Telefon musí být ve **stejné Wi-Fi** jako počítač (ne v mobilních datech ani v síti pro hosty).
2. Naskenujte fotoaparátem **QR kód** z okna konzole, nebo z aplikace na počítači (⚙ Nastavení → Otevřít na telefonu).
   Případně do prohlížeče v telefonu napište adresu z konzole, např. `http://192.168.1.25:8000`.
3. Vložte odkaz na video, klepněte na **Načíst**, zvolte formát a **Stáhnout**. Po dokončení klepněte na **Uložit**.
   - **iPhone (Safari):** soubor se uloží do aplikace Soubory → Stažené. Video do Fotek přesunete přes Sdílet → Uložit video.
   - **Android (Chrome):** soubor je ve složce Stažené soubory.

Tip: adresu si v telefonu uložte na plochu (Safari: Sdílet → Přidat na plochu).

## Povolení ve firewallu (přístup z LAN)

Když telefon stránku nenačte, firewall nejspíš blokuje příchozí spojení.

**Windows**
- Při prvním spuštění se objeví okno „Brána Windows Defender Firewall zablokovala některé funkce“. Zaškrtněte **Soukromé sítě** a klikněte na **Povolit přístup**.
- Když jste to zamítli: *Ovládací panely → Brána Windows Defender Firewall → Povolit aplikaci… → Změnit nastavení* a u `node.exe` (z této složky) zaškrtněte **Soukromé**.
- Wi-Fi musí být nastavená jako **Soukromá síť**: *Nastavení → Síť a internet → Wi-Fi → (vaše síť) → Typ síťového profilu → Soukromá*.
- Alternativa: PowerShell jako správce:
  `New-NetFirewallRule -DisplayName "YT Downloader" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private`

**macOS**
- Na dotaz „Chcete, aby aplikace node přijímala příchozí síťová připojení?“ klikněte na **Povolit**.
- Dodatečně: *Nastavení systému → Síť → Firewall → Volby…* a u `node` nastavte **Povolit příchozí připojení**.

**Další možné příčiny:** router má zapnutou „izolaci klientů“ / „AP isolation“ (typické pro sítě pro hosty), nebo je zapnutá VPN.

## Funkce

- **Formáty:** MP4 (video + zvuk), MP3 (128 / 192 / 320 kbps), M4A (původní AAC bez překódování), WebM/Opus (původní stopa)
- **Kvalita MP4** podle toho, co video skutečně nabízí (144p až 4K/8K). Video a zvuk spojí ffmpeg.
  Rozlišení 2K/4K má na YouTube jen kodek VP9/AV1, takže ho starší telefony nemusí přehrát. Pro nejlepší kompatibilitu volte 1080p a nižší.
- **Volitelně** titulky (SRT) a miniatura (JPG). Do MP3 a M4A se obal vloží automaticky.
- **Playlisty:** seznam videí se zaškrtáváním a stažením jako ZIP
- **Fronta** s živým průběhem (rychlost, zbývající čas) a **historie** aktuální relace
- **Srozumitelné chyby:** soukromé video, věkové omezení, regionální blokace, neplatná URL, ochrana proti botům…
- **Aktualizace yt-dlp** jedním tlačítkem (⚙ Nastavení). YouTube často mění rozhraní, takže když stahování přestane fungovat, aktualizujte jako první.

## Nastavení – `config.json`

| Klíč | Výchozí | Význam |
|---|---|---|
| `port` | `8000` | Port serveru. Když je obsazený, použije se další volný. |
| `allowLan` | `true` | `false` = aplikace je dostupná jen na tomto počítači. Jde přepnout i v UI (jen z počítače). |
| `pin` | `""` | Např. `"4821"`. Jiná zařízení pak musí zadat PIN, tento počítač ne. Po 5 chybných pokusech následuje 5 minut blokace. |
| `maxConcurrentDownloads` | `2` | Kolik stahování běží současně. Ostatní čekají ve frontě. |
| `maxDurationMinutes` | `240` | Delší videa se odmítnou. |
| `maxFileSizeMB` | `4096` | Maximální velikost jednoho souboru. |
| `maxPlaylistItems` | `100` | Maximální počet videí z playlistu najednou. |
| `fileTtlMinutes` | `60` | Hotové soubory se nejpozději po této době smažou. |
| `deleteAfterSaveMinutes` | `2` | Po úplném stažení do zařízení se soubor smaže po této době (rezerva pro opakované stažení). |
| `openBrowser` | `true` | Po startu otevřít prohlížeč. |
| `allowedHosts` | `[]` | Další názvy, přes které lze aplikaci otevřít (např. `"muj-pc.local"`). IP adresy fungují vždy. |

Po změně `config.json` restartujte server.

## Bezpečnost a soukromí

- yt-dlp se spouští jako proces s **polem argumentů**, nikdy přes shell. Do yt-dlp jde jen URL, kterou server sám sestaví z ověřeného ID videa nebo playlistu (povoleny jsou jen `youtube.com`, `youtu.be`, `music.youtube.com`, `m.youtube.com`).
- Ochrana proti útokům z jiných webů: kontrola hlavičky `Origin` (CSRF), hlavičky `Host` (DNS rebinding) a přísné Content-Security-Policy.
- Volitelný PIN (podepsaná HttpOnly cookie), omezení pokusů, přepínač přístupu z LAN.
- Dočasné soubory jsou v systémové temp složce (`…/yt-downloader`) a mažou se po stažení do zařízení, nejpozději po 1 hodině, při chybě nebo zrušení a při ukončení serveru.
- **Žádná data nejdou mimo váš počítač**, kromě požadavků na YouTube nutných ke stažení. Náhledy videí stahuje server, takže telefon komunikuje jen s vaším počítačem.

## Ruční instalace binárek

Když automatický setup selže (firewall, proxy), stáhněte binárky ručně podle `bin/README.txt`.
Aplikace hledá programy nejdřív ve složce `bin/`, pak v systému (PATH). Spuštění bez launcheru: `bin/node server/index.js --open`.

Znovu stáhnout všechny binárky: Windows `powershell -ExecutionPolicy Bypass -File setup.ps1 -Force`, macOS `bash setup.sh --force`.

## Struktura

```
start.bat / start.command   spouštěče (při prvním spuštění zavolají setup)
setup.ps1 / setup.sh        stažení yt-dlp, ffmpeg a Node.js do bin/
config.json                 nastavení
bin/                        přenosné binárky (nejsou v gitu)
public/index.html           celé webové rozhraní (HTML+CSS+JS, bez frameworku)
server/index.js             HTTP server, API, SSE, stahování souborů
server/ytdlp.js             volání yt-dlp, sestavení argumentů, překlad chyb
server/jobs.js              fronta, průběh, playlisty, úklid
server/zip.js               vytváření ZIP (vč. ZIP64)
server/auth.js              PIN
server/validate.js          validace URL, čištění názvů souborů
server/qr.js + vendor/      QR kód (qrcode-generator, MIT, © Kazuhiko Arase)
```
