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
   - Když macOS hlásí *„Soubor start.command nebyl otevřen – nepodařilo se ověřit, že neobsahuje malware“*
     (macOS 15 Sequoia a novější už neumožňuje obejít hlášku přes pravé tlačítko → Otevřít):
     - **Terminál:** napište `xattr -dr com.apple.quarantine ` (s mezerou na konci), do okna přetáhněte složku aplikace a stiskněte Enter. Pak už dvojklik funguje.
     - **nebo** hlášku zavřete tlačítkem *Hotovo*, otevřete *Nastavení systému → Soukromí a zabezpečení*, sjeďte dolů a u start.command klikněte na **Přesto otevřít**.
   - Na starším macOS (14 a dřív) stačí **pravé tlačítko → Otevřít → Otevřít**.
   - Když se soubor otevře v textovém editoru, chybí mu oprávnění ke spuštění. V Terminálu spusťte `chmod +x start.command setup.sh`.
   - Při prvním spuštění se binárky stáhnou do `bin/` (podporované jsou Apple Silicon i Intel).
3. Otevře se prohlížeč. V okně Terminálu je adresa pro telefon a QR kód.

Server ukončíte zavřením okna nebo klávesami **Ctrl+C**.

### Android (bez počítače, přímo v telefonu)
Aplikace běží v telefonu v **Termuxu** (linuxové prostředí pro Android). Stahuje přímo do telefonu, počítač není potřeba.

1. Nainstalujte **Termux z F-Droidu**: https://f-droid.org/packages/com.termux/
   Verze z Google Play je zastaralá a nefunguje.
2. Otevřete Termux a zadejte (jednou):
   ```
   pkg install -y git
   git clone https://github.com/gidix13579/yt-downloader ~/yt-downloader
   bash ~/yt-downloader/start-android.sh
   ```
   Při prvním spuštění se doinstaluje Node.js, ffmpeg, Python a yt-dlp (asi 5 minut, kolem 300 MB). Pak se otevře Chrome s aplikací.
3. **Ikona na plochu (spuštění serveru jedním klepnutím):**
   nainstalujte **Termux:Widget** z F-Droidu (https://f-droid.org/packages/com.termux.widget/),
   na ploše přidejte widget *Termux:Widget* a v něm se objeví **YT Downloader**.
   Klepnutí spustí server a otevře aplikaci. Když server už běží, jen otevře aplikaci.
   Ikonu si můžete dát i samostatně: dlouze podržte widget → *Termux shortcut* → YT Downloader.
4. **Aplikace přes celou obrazovku:** v Chromu klepněte na tlačítko **Nainstalovat** vpravo nahoře
   (nebo ⋮ → *Přidat na plochu / Nainstalovat aplikaci*). Na ploše přibude ikona YT Downloader,
   která se otevírá jako samostatná aplikace bez adresního řádku.

**Stahování z aplikace YouTube:** u videa klepněte na **Sdílet** a vyberte
- **YT Downloader** (když máte nainstalovanou aplikaci z bodu 4 a server běží), nebo
- **Termux** (funguje vždy, server se v případě potřeby sám spustí).

V obou případech se otevře aplikace s načteným videem.

Aplikaci ukončíte v ⚙ Nastavení → **Ukončit server**. Když server neběží, aplikace místo chyby ukáže, jak ho spustit.
Soubory se po klepnutí na **Uložit** ukládají do složky *Stažené soubory*.

Poznámky k Androidu:
- Ve výchozím stavu je aplikace dostupná **jen v telefonu**, protože telefon bývá ve veřejných Wi-Fi.
  Pro přístup z jiných zařízení spusťte `bash ~/yt-downloader/start-android.sh --lan`.
  Android ale nedovolí zjistit IP adresu: najdete ji v Nastavení → Wi-Fi → (vaše síť).
- Aby Android server neuspal, skript zapíná *wake lock* (v oznámení Termuxu). Server ukončíte v Termuxu klávesami **Ctrl+C** (na klávesnici Termuxu je klávesa CTRL), nebo v oznámení Termuxu volbou **Exit**.
- Některé telefony (Xiaomi, Huawei, Samsung) aplikace na pozadí agresivně ukončují. V nastavení baterie pro Termux povolte „bez omezení“.
- Aktualizace na novou verzi aplikace: `cd ~/yt-downloader && git pull`
- Tlačítko „Aktualizovat yt-dlp“ na Androidu aktualizuje yt-dlp přes pip.

## Otevření z telefonu

1. Telefon musí být ve **stejné Wi-Fi** jako počítač (ne v mobilních datech ani v síti pro hosty).
2. Naskenujte fotoaparátem **QR kód** z okna konzole, nebo z aplikace na počítači (⚙ Nastavení → Otevřít na telefonu).
   Případně do prohlížeče v telefonu napište adresu z konzole, např. `http://192.168.1.25:8000`.
3. Vložte odkaz na video, klepněte na **Načíst**, zvolte formát a **Stáhnout**. Po dokončení klepněte na **Uložit**.
   - **iPhone (Safari):** soubor se uloží do aplikace Soubory → Stažené. Video do Fotek přesunete přes Sdílet → Uložit video.
   - **Android (Chrome):** soubor je ve složce Stažené soubory.

Tip: adresu si v telefonu uložte na plochu (iPhone Safari: Sdílet → Přidat na plochu, Android Chrome: ⋮ → Přidat na plochu).
Otevírá se pak s ikonou YT Downloader přes celou obrazovku.
Plnohodnotná instalace s vlastním oknem a sdílením do aplikace je možná jen na zařízení, kde server běží (Android/Termux), protože prohlížeče ji přes `http://` z jiného zařízení nepovolí.

## Tailscale – přístup odkudkoli

Když máte [Tailscale](https://tailscale.com) na počítači i na telefonu, aplikace to pozná sama a ukáže **dva QR kódy**: v konzoli i v ⚙ Nastavení → Otevřít na telefonu.

- **Domácí Wi-Fi:** telefon musí být ve stejné Wi-Fi.
- **Tailscale:** funguje odkudkoli (eduroam, mobilní data, jiná Wi-Fi). Stačí mít na telefonu zapnutý Tailscale.

Tailscale adresu (100.x.y.z) aplikace pozná automaticky. Když je k dispozici příkaz `tailscale`, vypíše i MagicDNS název (`http://vas-mac.tailXXXX.ts.net:8000`). Ten funguje taky a nemění se.
**Windows:** když se telefon přes Tailscale nepřipojí (a přes Wi-Fi ano), Windows nejspíš vede síť Tailscale jako *veřejnou* a firewall ji blokuje.
Spusťte PowerShell jako správce a zadejte `Set-NetConnectionProfile -InterfaceAlias Tailscale -NetworkCategory Private`.
Případně v *Povolit aplikaci přes bránu firewall* zaškrtněte u `node.exe` i **Veřejné**.

Přes Tailscale se připojí jen zařízení ve vašem tailnetu. Kdo s vámi tailnet sdílí, aplikaci otevře taky, takže v tom případě zvažte nastavení `pin`.

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
start-android.sh            spouštěč pro Android (Termux), doinstaluje balíčky
android/termux-url-opener   šablona pro „Sdílet → Termux“ z aplikace YouTube
public/manifest.webmanifest, sw.js, icons/   instalace jako aplikace (PWA), stránka „server neběží“
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
server/network.js           rozpoznání domácí LAN a Tailscale
server/qr.js + vendor/      QR kód (qrcode-generator, MIT, © Kazuhiko Arase)
```
