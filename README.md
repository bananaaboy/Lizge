# Sondra

Ein Medienstudio, das öffentlich im Internet steht und trotzdem nichts hochlädt.
Der Server liefert HTML, JavaScript und WebAssembly aus — danach rechnet
ausschließlich der Rechner des Besuchers.

Die Reiter heißen nach dem Ergebnis, nicht nach dem Verfahren — wer mit einer
Aufnahme und einer Frage ankommt, kennt die Fachwörter noch nicht, und eine
Reiterleiste ist der schlechteste Ort, um sie zu lernen.

| Reiter | | |
|---|---|---|
| **Herunterladen** | Downloader | Direkte Links, HLS-Playlisten und — auf Wunsch — Portale |
| **Umwandeln** | Konverter | FFmpeg als WebAssembly, zehn Ausgabeformate |
| **Spuren trennen** | Spurentrennung | Gesang, Schlagzeug, Bass, Übriges — ohne Modell-Download |
| **Lautstärke** | Lautheit | Vollständiges EBU R128 / ITU-R BS.1770-4 mit True-Peak-Grenze |
| **Zerschneiden** | Chopper | Schnitte an Anschlägen oder im Tempo-Raster, 16 Pads, Sample-Pack |
| **Tonart** | Harmonie | Tonart mit Camelot-Code, Akkordverlauf, Melodie als MIDI |

Das Tonart-Panel hat zwei Ansichten: „Einfach“ zeigt Tempo, Tonart und
Camelot-Code und sonst nichts, „Detail“ zusätzlich Akkorde, Tonklassen, die
Melodie und alle Einstellungen. Einfach überspringt die Tonhöhenverfolgung, den
teuren Teil, weil sie dort ohnehin nicht gezeigt wird — und sagt das auch, statt
im Detailmodus „keine Melodie gefunden“ für etwas zu melden, das nie gesucht
wurde.

Dazu: helles und dunkles Erscheinungsbild, Stapelverarbeitung mit ZIP-Ausgabe,
Installation als PWA und vollständiger Offline-Betrieb.

Überall, wo etwas bearbeitet wurde, lässt es sich anhören — und wo es ein Vorher
gibt, im direkten Umschalten dagegen. Der Umschalter hält die Abspielposition,
denn anders lässt sich ein Pegeleingriff oder eine Spurentrennung nicht
beurteilen.

## Schnellstart

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # statisches Bündel in dist/
npm run preview  # dist/ mit den richtigen Headern ausliefern

npm run typecheck        # TypeScript ohne Emit
npm run verify            # Lautheit und Timing prüfen
```

`dist/` ist ein Ordner mit statischen Dateien. Es gibt keine Laufzeit, keine
Datenbank, keinen API-Endpunkt.

## Warum das wirklich lokal ist

Drei Dinge machen die Behauptung überprüfbar:

1. **Keine fremden Ursprünge.** Schriften, WASM-Module und Skripte liegen im
   eigenen Bündel. Kein CDN, keine Google Fonts, kein Analytics. Der
   Netzwerk-Tab bleibt nach dem Laden still.
2. **Kein Speicher.** Medien liegen ausschließlich im Heap des Tabs — kein
   `localStorage`, keine IndexedDB, keine Cookies. Tab schließen ist die
   Löschtaste.
3. **Die einzige Ausnahme ist sichtbar.** Der Downloader holt genau die Adresse,
   die man eingibt, direkt vom Zielserver.

## Projektstruktur

```
Sondra/
├── index.html                     Einstieg; registriert den Isolations-Service-Worker
├── vite.config.ts                 Build, COOP/COEP im Entwicklungsserver
├── vercel.json                    Header für Vercel
├── scripts/
│   ├── verify-loudness.mts        Kalibrierungstest gegen BS.1770-4
│   ├── verify-tempo.mts           Tempoerkennung, Raster, Nulldurchgänge
│   └── verify-harmony.mts         Tonart, Tonhöhe, MIDI-Datei
├── public/
│   ├── _headers                   Header für Netlify und Cloudflare Pages
│   ├── staticwebapp.config.json   Header für Azure Static Web Apps
│   ├── coi-serviceworker.js       Isolations-Header und Offline-Cache
│   ├── manifest.webmanifest       PWA-Manifest
│   ├── fonts.css, fonts/          Selbst gehostete Schriften
│   └── favicon.svg, icon-*.png
└── src/
    ├── main.tsx, App.tsx
    ├── styles/theme.css           Designsystem als Tailwind-v4-Theme
    ├── lib/
    │   ├── ffmpegClient.ts        FFmpeg-WASM-Anbindung  ← siehe unten
    │   ├── service.ts             Extraktions-Dienst (YouTube und Co.)
    │   ├── theme.ts               Hell/Dunkel/System
    │   ├── zip.ts                 ZIP-Schreiber ohne Abhängigkeit
    │   ├── wakeLock.ts            Bildschirm wach halten
    │   ├── convert.ts             Ausgabeformate und Argumentbau
    │   ├── download.ts            Fetch mit Fortschritt, HLS, Speichern
    │   ├── fft.ts                 FFT, STFT, ISTFT mit WOLA
    │   ├── loudness.ts            BS.1770-4: K-Bewertung, Gating, True Peak
    │   ├── separation.ts          HPSS und Mittenkohärenz → vier Masken
    │   ├── onnx.ts                Optionaler Modell-Läufer (WebGPU/WASM)
    │   ├── timestretch.ts         Phasenvocoder, Resampler
    │   ├── onsets.ts              Transientenerkennung über Spektralfluss
    │   ├── tempo.ts               Tempo, Beat-Raster, Nulldurchgänge
    │   ├── chroma.ts              Tonklassenprofil
    │   ├── key.ts                 Tonart und Akkorde
    │   ├── pitch.ts               YIN-Tonhöhenverfolgung, Notenbildung
    │   ├── midi.ts                Standard-MIDI-Datei
    │   ├── audio.ts               Web-Audio-Brücke, Schnittoperationen
    │   ├── wav.ts                 RIFF-Leser und -Schreiber
    │   ├── workerClient.ts        Promise-Fassade über die Worker
    │   └── capabilities.ts        Laufzeiterkennung
    ├── workers/
    │   ├── protocol.ts            Nachrichtenverträge
    │   ├── loudness.worker.ts
    │   ├── stems.worker.ts
    │   └── sampler.worker.ts
    ├── components/
    │   ├── Landing.tsx, Dashboard.tsx, Waveform.tsx, FileDrop.tsx, AssetList.tsx
    │   ├── panels/                Die fünf Werkzeuge
    │   └── ui/primitives.tsx      Buttons, Karten, Regler, Kennzahlen
    ├── hooks/useDecodedAudio.ts
    └── state/store.ts             Sitzungszustand (nur im Speicher)
```

## FFmpeg WASM richtig einbinden

Das ist der Teil, an dem die meisten Integrationen scheitern. Vier Punkte.

### 1. Die drei URLs

`@ffmpeg/ffmpeg` ist nur ein RPC-Client. `new FFmpeg()` liefert eine Hülle,
`load()` startet einen eigenen Web Worker und übergibt ihm drei Adressen:

```ts
await ffmpeg.load({
  classWorkerURL: absolute(classWorkerUrl), // der RPC-Worker selbst
  coreURL:        absolute(coreUrl),        // Emscripten-Glue-Code
  wasmURL:        absolute(coreWasmUrl),    // das übersetzte FFmpeg
  ...(multiThreaded ? { workerURL: absolute(coreMtWorkerUrl) } : {}),
})
```

Die Adressen müssen **absolut** sein: der Worker löst relative Pfade gegen
seinen eigenen Skriptort auf, nicht gegen die Seite.

### 2. Assets aus dem eigenen Bündel statt vom CDN

Fast alle Beispiele holen den Core per `toBlobURL` von unpkg. Damit meldet sich
jeder Besucher bei einem Dritten an. Stattdessen sind beide Cores Abhängigkeiten,
und Vites `?url` macht gehashte Assets vom eigenen Ursprung daraus:

```ts
import coreUrl         from '@ffmpeg/core?url'
import coreWasmUrl     from '@ffmpeg/core/wasm?url'
import coreMtUrl       from '@ffmpeg/core-mt?url'
import coreMtWasmUrl   from '@ffmpeg/core-mt/wasm?url'
import coreMtWorkerUrl from '@ffmpeg/core-mt/worker?url'
import classWorkerUrl  from '@ffmpeg/ffmpeg/worker?url'
```

Wichtig sind die Export-Pfade des Pakets (`@ffmpeg/core/wasm`), nicht die
Dateipfade darunter. Dazu gehört in `vite.config.ts`:

```ts
optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', 'onnxruntime-web'] }
```

Ohne diese Zeile schreibt das Pre-Bundling die Adressen um, die diese Pakete zur
Laufzeit selbst auflösen, und der Core lädt nicht.

Zwei weitere Fallstricke, beide beim Testen aufgefallen:

- **`classWorkerURL` nicht setzen.** Als `?url`-Asset landet `worker.js` mit
  unaufgelösten relativen Importen im Bündel und stirbt beim ersten Import.
  Ohne die Option greift die Bibliothek auf `new URL('./worker.js',
  import.meta.url)` zurück, und Vite bündelt den Worker korrekt.
- **`assetsInlineLimit: 0`.** `ffmpeg-core.worker.js` ist klein genug, dass Vite
  es standardmäßig als `data:`-URI einbettet. Ein aus einer Data-URL erzeugter
  Worker bekommt einen undurchsichtigen Ursprung und darf den Core nicht mehr
  importieren — der Ladevorgang schlägt dann ohne nützliche Fehlermeldung fehl.

### 3. Mehrfädig nur bei Cross-Origin-Isolation

`@ffmpeg/core-mt` ist um ein Mehrfaches schneller, braucht dafür aber pthreads
und damit `SharedArrayBuffer`. Den gibt der Browser nur isolierten Dokumenten:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

`credentialless` statt `require-corp`, damit der Downloader weiterhin an fremde
Medien kommt, die keinen CORP-Header senden.

Die Header stehen für den Entwicklungsserver in `vite.config.ts`, für Netlify
und Cloudflare in `public/_headers`, für Vercel in `vercel.json` und für Azure in
`public/staticwebapp.config.json`. Wo sich gar keine Header setzen lassen —
GitHub Pages etwa —, ergänzt `public/coi-serviceworker.js` sie im Service Worker.

Fehlt die Isolation trotzdem, lädt `capabilities.ts` den einfädigen Core. Die
Anwendung funktioniert vollständig, nur langsamer. Die Kachel „Dieser Browser“
im Studio zeigt, welcher Weg gerade aktiv ist.

### 4. Eingaben kopieren, bevor FFmpeg sie bekommt

`writeFile` legt den ArrayBuffer des Aufrufers in die Transfer-Liste. Nach dem
Schreiben ist der Puffer also *detached* — die Datei in der Sitzung wäre eine
leere Hülle und ließe sich danach weder erneut umwandeln noch dekodieren noch
abspielen. `runFfmpeg()` übergibt deshalb eine Kopie. Das kostet einmal Speicher
und erspart einen Fehler, der erst beim zweiten Durchlauf auffällt.

### 5. MEMFS aufräumen

Jeder Lauf schreibt seine Eingaben in ein In-Memory-Dateisystem und liest die
Ausgaben zurück. `runFfmpeg()` löscht beides im `finally`-Zweig — sonst wächst
der Heap über eine lange Sitzung mit jeder Datei weiter.

Abbrechen geht nur über `terminate()`: ein laufender Core lässt sich nicht
unterbrechen. Der nächste Aufruf lädt ihn transparent neu.

## Der Downloader

Ein Panel, drei Wege. Direkter Link, HLS-Playlist und Portal-Adresse sind aus
Sicht des Nutzers dieselbe Aufgabe — Adresse einfügen, Datei bekommen —, also
teilen sie sich ein Adressfeld und einen Knopf. Der Weg ergibt sich aus der
Adresse; drei Chips zeigen, welcher gewählt wurde, und erlauben, ihn zu
überschreiben.

Die Reihenfolge ist bewusst: erst alles zum Laden, dann die Zusatzoptionen für
Portale, und ganz unten deren Bedingungen. Wer die Funktion einschaltet, füllt
zuerst Felder aus; der Hinweistext steht unter den Eingaben, auf die er sich
bezieht, nicht davor. Geschlossen misst die Karte rund 325 px, mit
aufgeklappten Portal-Optionen rund 675 px — beides passt ohne Scrollen.

Zeigt eine Adresse auf ein Portal, sagt der Hinweis unter den Chips genau das —
auch dann, wenn jemand von Hand auf „Direkter Link“ stellt. Ein Weg, den der
Browser nicht gehen kann, wird nicht als gangbar dargestellt.

### YouTube und andere Portale

Direkt geht das nicht, und das ist keine Nachlässigkeit: Portale liefern ihre
Medien ohne `Access-Control-Allow-Origin` aus, der Browser lässt eine fremde
Seite deshalb nicht an die Daten. Möglich wird es nur mit einem Server als
Zwischenstation — und der sieht die angefragte Adresse und die IP des Nutzers.

Deshalb ist die Funktion **standardmäßig aus** und muss in jeder Sitzung neu
eingeschaltet werden. Solange sie aus ist, gibt es keinen Codepfad, der eine
Adresse nach außen gibt. Wird sie eingeschaltet, steht der Hinweis dauerhaft im
Panel: was übertragen wird, an wen, und dass die Nutzung auf eigenes Risiko
erfolgt.

### FFmpeg lädt beim Öffnen, nicht beim ersten Klick

Der Kern ist rund 31 MB. Ihn erst beim ersten Umwandeln zu holen hieß, dass die
erste echte Handlung einer Sitzung eine halbe Minute ohne Erklärung stand — was
sich wie eine kaputte Seite liest, nicht wie eine beschäftigte. Er wird deshalb
beim Öffnen geholt, sichtbar, und die Werkzeuge erscheinen, sobald er da ist.

Zwei Dinge halten das Warten ehrlich:

* **Echte Bytes statt eines Kreisels.** Die `.wasm` wird hier mit einem
  Stream-Reader geholt und dem Worker als Blob übergeben — ein Download, echte
  Zahlen. `content-length` zählt allerdings die Bytes auf der Leitung, der
  Reader die entpackten; bei komprimierter Auslieferung sind das für diese Datei
  rund drei zu eins. Die Länge wird deshalb nur ohne `content-encoding`
  geglaubt und verworfen, sobald der entpackte Strom sie überholt. Dann läuft
  der Balken unbestimmt weiter, statt bei einem Drittel vollzulaufen und zu
  lügen.
* **Ein Fehlschlag ist keine verschlossene Tür.** Spurentrennung, Lautheit,
  Chopper und Harmonie rühren FFmpeg nie an. Scheitert das Laden, steht der
  Grund da und daneben ein Weg vorbei, statt einer Sackgasse. Überspringen geht
  auch währenddessen.

Beim zweiten Besuch liegt der Kern im Zwischenspeicher des Service Workers, die
Seite startet also sofort und auch ohne Netz.

### Eine Frage, einmal beantwortet

Fünf Panels beantworteten dieselbe Frage — „noch keine Datei" — fünfmal, und
jedes davon zweimal auf einem Bildschirm: ein Ablagebereich in der Mitte, ein
zweiter in der Seitenspalte, darunter die Bibliothek mit „Noch nichts geladen".
Drumherum Einstellungen für Material, das es nicht gab: Blendenlängen,
Modellwahl, Zielformate, alles zu entscheiden, bevor die Datei existierte, auf
die es sich bezieht.

Jetzt wird die Frage einmal beantwortet, im Dashboard, und das Panel rendert
überhaupt erst, wenn es etwas zu zeigen hat. Der Downloader ist ausgenommen: er
ist kein Werkzeug, das eine Datei braucht, sondern einer der beiden Wege, an
eine zu kommen — und der zweite Weg steht als Satz darunter.

Dasselbe Prinzip nach innen:

* **Erklärungen hinter ein Wort.** Wie FFmpeg rechnet, wie die Trennung
  funktioniert, wie gemessen wird — vier Zeilen Verfahrensbeschreibung standen
  jeweils zwischen der Überschrift und dem Knopf, für den man gekommen war.
* **Feineinstellungen eingeklappt.** Mittenschärfe, Maskenhärte, Auflösung,
  Medianfenster bei den Spuren; Zielwert, Grenze und Spitzenbehandlung bei der
  Lautheit. Vorgaben, die meistens passen, und ein Knopf davor.
* **Die Datei einmal benennen.** Die Bibliothek zeigt Name, Größe, Dauer,
  Abtastrate und einen Player. Eine zweite Karte daneben, die einen Teil davon
  wiederholte, ist weg.

Gemessen: leerer Zustand in allen fünf Werkzeug-Tabs identisch bei 955 px, mit
Datei zwischen 832 px und 1406 px. Bei 400 px Breite kein seitlicher Überlauf,
im Dunkelmodus kein Text auf gleichfarbigem Grund.

### Der Downloader passt auf einen Bildschirm

Eingeschaltet war der Tab 2270 Pixel hoch — knapp drei Bildschirme, und das
Adressfeld, also das Einzige, was bei jeder Nutzung gebraucht wird, stand ganz
oben, während der Rest der Seite Einrichtungstexte waren. Jetzt sind es 949
Pixel.

Was sich geändert hat, ist nicht das Kürzen von Texten, sondern wo sie stehen:

* **Die Einrichtung liegt in einem Dialog.** Sie wird einmal gelesen und danach
  nie wieder, also gehört sie hinter eine Tür statt dauerhaft zwischen das
  Adressfeld und alles andere. Der Dialog baut auf dem nativen
  `<dialog>`-Element auf, damit Fokusfalle, Escape und Hintergrund nicht
  schlecht nachgebaut werden müssen.
* **Auf der Seite bleiben zwei Zeilen:** was gerade gilt, und ein Knopf hinein.
* **Die Leiste „Dieser Browser" ist eine Zeile Chips** statt sechs Kennzahlen mit
  je einem Satz. Die Sätze stehen hinter „Was heißt das?" und im Tooltip.
* **Keine Tür hinter der Tür.** Im Dialog war noch eine Klapp-Ebene und ein
  Absatz, der vor dem Eingabefeld stand; die Ebene ist weg, der Absatz liegt
  unter „Warum gibt es nichts Leichteres?".

Bei 400 Pixeln Breite läuft nichts seitlich über, und der Dialog passt hinein.

Bleibt es dabei gesperrt, sagt die Prüfung jetzt, woran es liegt, statt es zu
vermuten: Chrome legt die Erlaubnis wie jede andere offen, also lässt sie sich
abfragen. `erteilt` und trotzdem nichts heißt, der Dienst läuft wirklich nicht.
`verweigert` heißt, es wurde einmal Nein gesagt und der Browser fragt nicht
wieder — dann hilft nur das Schloss in der Adresszeile. `noch nicht erteilt`
heißt, die Frage steht aus.

Und eine Frage kommt nur auf einen Klick hin. Ein Wächter auf dem Zeitgeber hat
keine Nutzeraktion hinter sich, also kann er keine Abfrage auslösen — deshalb
gibt es **Zugriff erlauben**. Das ist das eine, was auf einer gehosteten Seite
von Hand passieren muss; danach läuft wieder alles von selbst.

### Der Fehler war ein Wort

Die Anfrage darf ansagen, wohin sie geht, und der Browser prüft die Ansage gegen
den tatsächlichen Landeplatz. Es gibt drei Räume: `loopback` ist dieser Rechner,
`local` ist das Netz, in dem er steht, `public` der Rest. Hier stand `local` für
eine Adresse auf `127.0.0.1` — und eine falsche Ansage wird nicht ignoriert. Sie
fällt durch die Prüfung, und die Anfrage stirbt, ohne dass überhaupt gefragt
wird.

Genau das war das Bild: Erlaubnis vorhanden, Erlaubnis nicht verweigert, keine
Abfrage, tote Anfrage. Von einer gehosteten Seite aus gegen alle vier Werte
gemessen:

| Ansage | Ziel `127.0.0.1:9000` |
|---|---|
| keine | geht durch |
| `loopback` | geht durch |
| `local` | scheitert |
| `private` | scheitert |
| `public` | scheitert |

Also `loopback` für diesen Rechner, `local` für alles andere Lokale, und wenn
der erste Wert scheitert, bekommt der zweite eine Chance — ein Name kann in
beide Räume auflösen. Danach verbindet sich die gehostete Seite von selbst.

### Der Spiegel: die Seite auf den eigenen Rechner holen

Alles Bisherige streitet mit dem Browser darüber, ob eine Seite aus dem Netz
`localhost` anfassen darf. Der Spiegel beendet den Streit, indem er die Seite auf
`localhost` stellt. Dann liegen Seite und Dienst im selben Adressraum: keine
Erlaubnis greift, keine Vorabfrage ist nötig, und es verhält sich in Browsern
gleich, die von alldem nie etwas umgesetzt haben.

Er ist eine Durchreiche, keine Kopie: jede Anfrage wird von der Seite geholt und
weitergegeben, man sieht also immer den aktuellen Stand. Zwei Kopfzeilen kommen
dazu, die den mehrfädigen FFmpeg-Kern freischalten — ohne sie liefe die App
zwar, nur langsamer, und das an einen Umweg zu verlieren wäre ein schlechter
Tausch. Inhaltskodierung und -länge fallen weg, weil der Rumpf im Vorbeigehen
entpackt wird und die alten Angaben ihn nicht mehr beschreiben.

Die heruntergeladene Datei trägt die Adresse der Seite, von der sie stammt,
bereits in sich. Ein Befehl, dann `localhost:8787` öffnen statt der Website.

Gemessen, im Browser durch den Spiegel hindurch: Seite lädt, gilt als lokal,
`crossOriginIsolated` und `SharedArrayBuffer` stehen, Service Worker
kontrolliert, kein Erlaubnis-Knopf mehr nötig, Verbindung zum Dienst nach 1,8
Sekunden ohne einen einzigen Klick, und eine Datei komplett durchgeladen.

### Die Brücke, für Browser ohne diese Abfrage

Ältere Browser kennen die Erlaubnis nicht. Dort galt die ältere Regelung: nicht
der Besucher, sondern der *Dienst* muss für die Anfrage bürgen. Eine Anfrage aus
dem Netz an eine private Adresse löst eine Vorabfrage mit
`Access-Control-Request-Private-Network` aus, und nur eine Antwort mit
`Access-Control-Allow-Private-Network: true` lässt die eigentliche Anfrage
folgen. cobalt sendet die Kopfzeile nicht und hat auch keinen Grund dazu, also
muss etwas davor es tun.

Mehr ist die Brücke nicht: keine 60 Zeilen Node, keine Abhängigkeiten, hört nur
auf der Loopback-Schnittstelle. Sie beantwortet die Vorabfrage selbst und reicht
alles andere unverändert durch — bis auf die CORS-Kopfzeilen, die ersetzt statt
ergänzt werden, weil zwei Werte für eine Kopfzeile vom Browser verworfen werden.

Sie läuft auf Port 9001, und der steht in der Kandidatenliste *vor* den übrigen:
wer sie gestartet hat, hat die Adresse, die von einer gehosteten Seite aus
tatsächlich funktioniert, und sie zuerst zu prüfen spart zwei aussichtslose
Versuche. Einzutragen ist nichts.

Geprüft mit echter Vorabfrage: 204 mit allen nötigen Kopfzeilen, echte Anfrage
mit unverändertem Rumpf und genau einem Satz CORS-Kopfzeilen, und in der App
selbst gefunden, verbunden und eine Datei durchgeladen.

### Wenn die Seite gehostet ist, der Dienst aber zu Hause läuft

Die Prüfung hat den Fall dann auch geliefert: Seite auf `https://www.lizge.ch`,
Dienst auf `http://localhost:9000`. Das ist kein Fehler im Dienst, sondern eine
Sperre des Browsers. Eine Seite aus dem Netz, die auf `localhost` zugreift, hat
die Form eines Angriffs auf den Router im selben Haus, also verlangt Chrome seit
Version 141 dafür die ausdrückliche Erlaubnis des Besuchers — und eine
HTTPS-Seite, die `http://` anfragt, wäre zusätzlich als Mixed Content
abgewiesen worden.

Der Ausweg steht in derselben Spezifikation: `targetAddressSpace: 'local'` sagt
einer Anfrage an, wohin sie geht. Erst das erlaubt dem Browser, die Frage dem
Besucher zu stellen, statt die Anfrage stumm fallen zu lassen — und eine erteilte
Erlaubnis hebt die Mixed-Content-Abweisung gleich mit auf.

Wichtig ist die Reihenfolge, und die ist nicht geraten: **erst normal, dann mit
Kennzeichnung.** Die Angabe wird gegen den tatsächlichen Landeplatz geprüft,
also lässt ein „local" für eine Adresse, die sich als Loopback herausstellt, eine
Anfrage scheitern, die sonst durchgegangen wäre. Genau das ist im Versuch
passiert, mit einer Seite unter eigenem Hostnamen, der auf 127.0.0.1 zeigt: neun
gekennzeichnete Anfragen, keine Verbindung. Als Nachschlag statt als Vorgabe
verbinden sich beide Fälle wieder.

Zu prüfen bleibt, was hier nicht prüfbar war: Ob die Erlaubnisabfrage auf einer
echt öffentlichen Adresse erscheint, lässt sich in einer Umgebung ohne
öffentliche IP nicht feststellen. Getestet ist, dass die Kennzeichnung gesetzt
wird, wo sie hingehört, und dass sie nichts kaputt macht, wo sie nicht hingehört.

### Ein Befehl startet beides

Der Spiegel war ein zweiter Schritt, und ein zweiter Schritt ist einer zu viel.
Er steckt jetzt im Einrichtungsbefehl selbst: `sondra-start.mjs` fährt den Dienst
hoch **und** liefert Sondra von demselben Rechner aus. Danach liegen Seite und
Dienst auf einer Maschine, es gibt keine Grenze zu überschreiten, und niemand
muss etwas erlauben.

Die Datei liegt als statisches Asset auf der Seite, wird von den Befehlen und von
beiden Skripten geholt und existiert genau einmal — der Spiegel war vorher im
Browser erzeugter Text, was eine zweite Umsetzung derselben Sache gewesen wäre.
Auf einer lokal geöffneten Seite entfällt sie ganz: dort bringt sie nichts, also
endet der Befehl wie bisher mit `pnpm start`.

Beim Einbauen wäre fast ein stiller Fehler entstanden: die Skript-Erzeuger
bekamen die Adresse zunächst nicht als Parameter, und `origin` hätte sich
klaglos auf die globale DOM-Variable bezogen — ein echter Wert, der plausibel
aussieht und überall außerhalb eines Browsers falsch ist.

Gemessen, mit dem echten Dienst statt einem Attrappen-Server: ein Aufruf, cobalt
11.7.1 auf 9000 und die Seite auf 8787 mit den Isolations-Kopfzeilen. Im Browser
darüber geöffnet gilt sie als lokal, `crossOriginIsolated` steht, kein
Erlaubnis-Knopf erscheint, die Verbindung steht nach 8 ms — und ein echter
YouTube-Download lief durch: 84 MB, 1080p.

### Was auf einer gehosteten Seite wirklich hilft

Drei Anläufe lang war die Erlaubnis fürs lokale Netzwerk die Empfehlung. Auf der
echten Seite hat sie dreimal nicht funktioniert: Chrome meldet sie als
verfügbar, meldet sie als nicht verweigert, und fragt trotzdem nicht — auch nicht
aus einem frischen Klick heraus, mit korrekt angesagtem Adressraum.

Zwei Verdächtige wurden dabei ausgeschlossen, nicht vermutet:

* **Mixed Content ist es nicht.** Gemessen von einer echten HTTPS-Seite gegen
  `http://localhost:9000`: geht durch, mit und ohne Ansage. Chrome behandelt
  `localhost` als vertrauenswürdig, die Regel greift dort gar nicht.
* **Der falsche Adressraum war ein echter Fehler, aber nicht der letzte.**
  `loopback` statt `local` reparierte den Fall von einer HTTP-Seite aus; von der
  echten Seite bleibt die Anfrage tot.

Deshalb steht jetzt der Spiegel an erster Stelle, wenn nichts antwortet, und die
Erlaubnis nur noch als Nebensatz. Der Spiegel hängt von keiner Browserfunktion
ab: er liefert die Seite von demselben Rechner aus, auf dem der Dienst läuft, und
zwischen zwei Dingen auf einer Maschine gibt es keine Grenze, die jemand erlauben
müsste. Erneut durch ihn hindurch gemessen: gilt als lokal, Isolation steht,
verbunden nach 1,8 Sekunden ohne einen Klick, Datei komplett geladen.

Eine Empfehlung, die dreimal nicht getragen hat, ein viertes Mal zu wiederholen,
wäre Rat ohne Beleg.

### Ein Knopf, nicht zwei

Prüfen und Erlauben waren getrennt, und die Prüfung endete mit „drücken Sie jetzt
den anderen Knopf". Das ist eine Anweisung, keine Lösung — und schlimmer: die
Erlaubnisanfrage hatte damit nicht mehr den Klick hinter sich, den eine Abfrage
braucht. Ein Browser stellt die Frage nur als Antwort auf eine echte Interaktion,
also muss die auslösende Anfrage das Erste sein, was auf den Klick folgt, nicht
das Zweite nach einem Fehlschlag.

Auf einer gehosteten Seite heißt der Knopf deshalb „Verbinden und Zugriff
erlauben" und stellt die Anfrage sofort; lokal heißt er „Jetzt prüfen" und lässt
die Erlaubnis weg, die dort nichts zu tun hat.

Zwei Kleinigkeiten aus demselben Durchgang: Die Anfrage brach nach acht Sekunden
ab — währenddessen steht der Erlaubnis-Dialog auf dem Schirm und will gelesen
werden, acht Sekunden sind eine plausible Bedenkzeit, und das Abbrechen hätte
genau die Anfrage gekillt, für die die Antwort gedacht war. Jetzt zwei Minuten.
Und der Bericht kürzte jede Fehlermeldung auf den ersten Satz, indem er am ersten
Punkt trennte — was aus `127.0.0.1:9000` ein „127." machte und eine abgeschnittene
Adresse als Ursache meldete.

### „Jetzt prüfen": der Fehler im Klartext

Der Wächter arbeitet leise, was richtig ist, solange er irgendwann Erfolg hat.
Hat er nie welchen, sagt das Schweigen nichts, und mehr als „es verbindet nicht"
lässt sich dann nicht berichten. Neben dem Zustand steht deshalb **Jetzt
prüfen**: probiert jede lokale Adresse einmal und schreibt hin, was
zurückkam — welche Adresse, welche Antwort, und von wo diese Seite selbst
ausgeliefert wird. Das Letzte entscheidet, ob der Fehler beim Dienst liegt oder
beim Browser, und lässt sich als Text weitergeben.

Dabei kam gleich ein irreführender Fall heraus: `host.docker.internal` wurde mit
„muss über HTTPS erreichbar sein" abgewiesen — eine wahre Aussage über eine
Regel, die hier nicht gilt, also die nutzloseste Sorte Fehlermeldung. Docker
Desktop leitet den Namen auf den Host zurück, er zählt jetzt als lokal.

### Woran man sieht, ob es verbunden ist

Die Antwort steht jetzt in der Leiste „Dieser Browser", unter **Dienst**, neben
Isolation, Kernen und FFmpeg: `aus`, `wird gesucht` oder `verbunden` samt
Adresse und ob YouTube dabei ist. Die Leiste liegt unter jedem Tab, also
beantwortet sie die Frage überall und ohne Umweg.

Vorher stand sie nur im Downloader, hinter dem eingeschalteten Regler, halb
unten in einer Karte — das ist keine Antwort, das ist eine Schnitzeljagd. Die
Verbindung lag dazu in der Zustandsverwaltung genau dieses Panels, was einen
zweiten Fehler nach sich zog: Beim Wechsel auf einen anderen Tab wurde das Panel
abgeräumt, die Verbindung ging verloren und die Leiste meldete trotzdem weiter
„verbunden". Beide lesen jetzt denselben Zustand (`lib/serviceState.ts`), und
der überlebt den Tabwechsel.

„Trennen" schaltet die Funktion mit ab. Sonst fände der Wächter dieselbe Instanz
vier Sekunden später wieder, und das meint niemand, der auf „Trennen" drückt.

Der frühere Ablauf schaute einmal nach, wenn der Schalter umgelegt wurde, und
gab dann auf — genau verkehrt herum. Der übliche Fall ist: einschalten,
weggehen, den Dienst starten, zurückkommen. Die Seite hatte da längst
aufgehört zu suchen, und nichts sagte einem das.

Jetzt wartet die Seite. Solange die Funktion an ist und nichts geantwortet hat,
schaut sie alle vier Sekunden nach und verbindet sich von selbst; eine
abgelehnte Verbindung auf localhost kostet nichts. Gemessen: 2,3 Sekunden vom
Start des Dienstes bis zum verbundenen Zustand, ohne einen Klick. Die Statuszeile
sagt das auch, statt es zu verschweigen.

Bleibt es still, meldet sich die Seite nach rund 25 Sekunden — Schweigen, das
sich nicht erklärt, ist schlimmer als eine Vermutung. Was sie dann sagt, hängt
davon ab, woher sie selbst kommt:

* **Sondra lokal geöffnet.** Dann ist die naheliegende Erklärung die richtige:
  läuft der Dienst wirklich, und steht in seinem Fenster `port: 9000`?
* **Sondra aus dem Netz geöffnet.** Dann ist sie es meistens nicht. Browser
  lassen eine Seite aus dem Netz nicht ohne Weiteres auf Adressen im eigenen
  Rechner zugreifen, und von der Seite aus sieht diese Sperre exakt so aus wie
  „da läuft nichts". Genau weil hier die naheliegende Diagnose die falsche ist,
  wird sie benannt: Zugriff aufs lokale Netzwerk erlauben, wenn der Browser
  fragt, sonst Sondra selbst lokal öffnen.

Diese Unterscheidung steht auch schon vorab unter der Frage nach Node und Git,
damit sie nicht erst nach einer halben Minute Suchen auftaucht.

### Warum es keinen Weg ohne Server gibt

Die Frage stellt sich zwangsläufig: Geht YouTube nicht auch ohne, dass man
irgendetwas einrichtet oder installiert? Nachgeprüft lautet die Antwort nein,
und zwar aus drei unabhängigen Gründen:

* **Der Browser selbst kommt nicht heran.** `*.googlevideo.com`, wo die
  Videodaten liegen, gibt CORS nur für `youtube.com` frei. Selbst mit der
  fertigen Stream-Adresse in der Hand darf eine fremde Seite die Bytes nicht
  lesen. Damit scheidet jede reine Browser-Lösung aus, egal wie clever.
* **Die Verzeichnisse offener Instanzen sind weg.** `instances.cobalt.best` und
  `instances.hyper.lol` haben keine DNS-Einträge mehr, abgeschaltet, nachdem
  automatisierte Abrufe die Betreiber leergesaugt hatten.
* **Der offizielle Dienst führt YouTube nicht mehr.** `api.cobalt.tools`
  antwortet (11.7.1, CORS offen), listet YouTube aber nicht unter seinen
  Diensten und verlangt zusätzlich eine Bot-Prüfung.

Auch Cloud-Hosting hilft nicht: YouTube sperrt die IP-Bereiche von
Rechenzentren, woran die frühere öffentliche Instanz gestorben ist. Ein
Ein-Klick-Deployment wäre einfach und würde trotzdem nichts laden.

Es bleibt also: Holen muss ein Server, und den betreibt entweder jemand, den
man kennt, oder man selbst. Beides steht im Panel, das Eingabefeld für eine
fremde Adresse zuerst.

### Der Weg zurück: Datei hinein, egal woher

Woher die Datei auch kommt — aus irgendeinem Programm, von einem anderen
Rechner, aus einer Nachricht —, der Rückweg ist absichtlich kurz, denn daran
scheitert es sonst:

* **Ziehen.** Eine Datei irgendwo ins Fenster fallen lassen genügt; ein
  Drop-Ziel, das man treffen muss, ist eine Abgabe auf jede einzelne Nutzung.
* **Öffnen mit.** Ist Sondra als App installiert, trägt es sich über
  `file_handlers` beim Betriebssystem als Öffner für Audio- und Videodateien
  ein. Aus dem Dateimanager heraus landet die Datei direkt in der Sitzung.
* **Teilen.** Auf dem Handy nimmt ein `share_target` die Datei aus dem
  Teilen-Menü entgegen. Weil ein Teilen als POST ankommt und eine Seite den
  Rumpf nach der Navigation nicht mehr lesen kann, nimmt der Service Worker die
  Dateien heraus, legt sie kurz ab und leitet weiter — die App sammelt sie ein
  und räumt das Regal wieder leer.

### Eine Instanz für den eigenen Rechner

Dieser Weg steht in der Oberfläche offen unter „Eigenen Dienst betreiben",
mit zwei Möglichkeiten: **Ohne Docker** (Vorgabe) und **Mit Docker**. Docker
setzt unter Windows WSL2 und damit eine virtuelle Maschine voraus, und dieser
Stapel hat offene Fehler, an denen man nicht vorbeikommt — etwa
`Wsl/Service/…/MountDisk/HCS/ERROR_NOT_SUPPORTED`, wo WSL seine eigene
Systemplatte nicht mehr einhängt. Der Node-Weg kennt diese Fehlerklasse nicht.

Innerhalb von „Ohne Docker" steht eine Frage statt einer Annahme: **Was ist auf
diesem Rechner schon da?** Zwei Schalter, Node.js und Git, beide anfangs aus.
Die Befehle darunter sind dann die für diesen Rechner und keine anderen — die
Liste lässt sich von oben bis unten einfügen, ohne dass jemand herausfinden
muss, welche Hälfte ihn betrifft.

| Node.js | Git | Was die Anleitung zeigt |
|---|---|---|
| fehlt | fehlt | Node installieren, dann Archiv, Stub, Start |
| da | fehlt | Archiv, Stub, Start |
| fehlt | da | Node installieren, dann klonen und starten |
| da | da | klonen und starten |

Für das Installieren von Node gibt es nur dort einen Befehl, wo die Vermutung
trägt: `winget` unter Windows, `brew` unter macOS. Linux hat ein Dutzend
Paketverwaltungen und keine sichere Annahme, also steht dort ein Hinweis mit
Link statt eines Befehls, der falsch sein könnte. Git wird nie installiert —
fehlt es, kommt der Quelltext als Archiv, und das ist ohnehin der kürzere Weg.

Eine Eigenheit, die sich nur durch Ausführen zeigt: **der Dienst startet nicht
außerhalb eines git-Ordners.** Er sucht von seinem Arbeitsverzeichnis aufwärts
nach `.git` und bricht mit `no git repository root found` ab — nicht weil er git
benutzt, sondern weil er daraus Fassung, Branch und Remote für seine eigene
Auskunft liest (`packages/version-info`). Drei Textdateien genügen ihm:
`.git/HEAD`, `.git/logs/HEAD`, `.git/config`. Der Weg ohne Git schreibt genau
die, und braucht dafür kein git.

Zwei weitere Fallen, ebenfalls beim Ausführen gefunden und in den Skripten
berücksichtigt: `corepack` fragt vor dem Nachladen nach und bliebe im Skript
hängen, deshalb `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`; und PowerShell wertet in
einfachen Anführungszeichen keine Escapes aus, weshalb die drei Dateien dort
über wörtliche Here-Strings geschrieben werden statt über `` `n ``.

Geprüft wurde das nicht auf dem Papier: Das erzeugte Skript wurde unverändert
ausgeführt, holt das Archiv, legt den Stub an, installiert mit dem festgelegten
pnpm 9.6.0 und startet cobalt 11.7.1 — und Sondra hat sich anschließend damit
verbunden. Die eigene Instanz führt dabei **21 Dienste einschließlich YouTube**
und verlangt keine Bot-Prüfung, im Gegensatz zum offiziellen Endpunkt.

Eine eigene Instanz lädt von YouTube meist problemlos, weil sie von der eigenen
Leitung aus anfragt statt von einer, die dort bekannt ist.

Es ist **keine Standard-Instanz hinterlegt**. Eine mitgelieferte Adresse würde
die Anfragen aller Nutzer still an eine Maschine schicken, die weder sie noch
dieses Projekt kontrolliert. Stattdessen tragen Nutzer eine eigene oder eine
ihnen bekannte cobalt-kompatible Instanz ein. Die Adresse wird lokal
gespeichert, ein etwaiger Zugangsschlüssel bewusst **nicht** — ein Schlüssel in
`localStorage` überlebt die Absicht, mit der er eingegeben wurde.

Alles andere bleibt unberührt: Konvertierung, Spurentrennung, Lautheit und
Sampler rechnen weiterhin ausschließlich lokal.

## Hell und dunkel

Drei Zustände statt zwei: hell, dunkel und „System“, das dem Betriebssystem
folgt und ihm auch später noch folgt. Nur die ausdrücklichen Entscheidungen
schreiben ein Attribut an `<html>`; „System“ lässt die Media Query in
`theme.css` entscheiden.

Farben heißen nach ihrer Rolle, nicht nach ihrem Ton — `canvas` statt
`cream-paper` —, weil genau der Ton sich zwischen den Themes ändert. Tailwind
gibt jede Farbklasse als `var(--color-…)` aus, sodass ein Theme-Wechsel die
Variablen neu belegt und nichts an den Komponenten anfasst. Ein kurzes Skript im
`<head>` setzt das Attribut vor dem ersten Paint, damit niemand kurz das falsche
Theme sieht.

Wellenformen zeichnen auf Canvas und in Wavesurfer mit echten Farbwerten. Die
werden zur Laufzeit aus dem Cascade gelesen; beim Wechsel wird Wavesurfer
umgefärbt statt neu aufgebaut, sonst wären alle gesetzten Bereiche weg.

## Offline und Installation

Der Service Worker hat zwei Aufgaben: die Isolations-Header (siehe oben) und den
Offline-Cache. Antworten vom eigenen Ursprung werden beim Abruf mitgeschrieben
und bei fehlendem Netz aus dem Cache bedient — auch der 32 MB große FFmpeg-Core.
Ab dem zweiten Besuch braucht die Anwendung kein Netz mehr. Fremde Ursprünge
werden nie zwischengespeichert; der Verkehr des Extraktions-Dienstes läuft
unverändert durch.

Über das Manifest lässt sich Sondra installieren. Der Knopf erscheint nur, wenn
der Browser ihn anbietet.

## Die Rechenverfahren

**Lautheit.** Vollständiges BS.1770-4, gegen den Referenzpunkt der Norm geprüft
(`npm run verify:loudness`): ein 1-kHz-Sinus mit Spitzenamplitude X dBFS auf
beiden Kanälen liest X LUFS — gemessen auf 0,01 LU genau. Angehängte Stille
verschiebt den Wert nicht, der True-Peak-Messer findet die 3 dB, die zwischen den
Abtastwerten liegen, und die Verstärkung trifft ihr Ziel auf 0,01 dB. Die K-Bewertung aus Hochregal- und
RLB-Hochpassfilter wird für die tatsächliche Abtastrate berechnet, nicht aus der
48-kHz-Tabelle übernommen. Danach 400-ms-Blöcke mit 75 Prozent Überlappung über
Präfixsummen, absolutes Gate bei −70 LUFS, relatives bei −10 LU. Loudness Range
nach Tech 3342 aus 3-Sekunden-Blöcken.

Der True-Peak-Messer tastet vierfach über eine Polyphasen-FIR über. Zwei Details
entscheiden über die Genauigkeit: eine ungerade Zahl von Koeffizienten je Phase,
sodass Phase 0 die Identität ist, und Stille statt Randwiederholung außerhalb des
Puffers — hält man stattdessen den Randwert, klingelt der Filter gegen ein
künstliches Plateau und meldet bei hohen Frequenzen bis zu 3 dB zu viel. So
bleibt der Fehler über das ganze Band unter 0,3 dB.

**Spurentrennung.** Medianfilter über die Zeitachse eines Magnitudenspektrogramms
lassen den harmonischen Anteil übrig, Medianfilter über die Frequenzachse den
perkussiven (Fitzgerald 2010). Parallel schätzt die Ähnlichkeit von links und
rechts pro Bin, wie mittig ein Anteil liegt — bei Lead-Gesang fast immer sehr
mittig. Aus beiden entstehen vier Affinitäten, die pro Bin auf eins normiert
werden; die Spuren addieren sich damit exakt zum Original zurück. Der gleitende
Median hält sein Fenster sortiert, also eine Einfüge- und eine Löschoperation je
Ausgabewert statt einer Sortierung. Verarbeitet wird in Abschnitten mit
Überblendung, sodass der Speicherbedarf nicht von der Dateilänge abhängt.

**Tonhöhe und Länge.** Ein Phasenvocoder propagiert die Momentanfrequenz von
Rahmen zu Rahmen; Transponieren ist Dehnen plus Resampling mit dem Kehrwert. Die
Pads spielen dagegen über die Abspielrate — sofort hörbar, so wie es
Hardware-Sampler tun.

**Tempo.** Autokorrelation der Onset-Hüllkurve: erst messen, wie stark sich das
Spektrum von Rahmen zu Rahmen nach oben ändert, dann fragen, bei welcher
Verschiebung dieses Signal am besten mit sich selbst zusammenfällt. Eine zweite
Suche findet die Phase, damit das Raster auf dem ersten Schlag beginnt und nicht
bei Sekunde null.

Die Sicherheit hat zwei Bedingungen: die Korrelationsspitze muss aus dem Feld
herausragen *und* das Material muss überhaupt Transienten haben. Ein gehaltener
Akkord erfüllt nur die erste und bekäme sonst ein erfundenes Tempo attestiert.
Halbes und doppeltes Tempo beschreiben dasselbe Raster, deshalb stehen ×2 und ÷2
daneben — eine Automatik kann das nicht entscheiden, ein Ohr schon.

**Schnittpunkte** wandern auf den nächsten steigenden Nulldurchgang, höchstens
wenige Millisekunden weit. Ein Schnitt mitten in der Wellenform hinterlässt eine
Stufe, und eine Stufe klickt. Blenden verdecken das, kosten aber den Anschlag —
genau den Teil eines Chops, auf den es ankommt.

## Was hier geht, was ein DAW nicht macht

Zwei Dinge, für die Produzenten sonst zu Zusatzsoftware greifen.

**Tonart aus Audio.** FL Studio 2026 benennt Akkorde im Piano Roll, also aus
MIDI — nicht aus einer Aufnahme, die man hineinzieht. Der Pitch-Region-Detektor
in Edison ist kein Tonartfinder; dafür gibt es Mixed In Key zu kaufen. Nötig ist
das nicht: eine Tonart ist eine Verteilung über die zwölf Tonklassen, und
Krumhansl und Kessler haben gemessen, wie diese Verteilungen aussehen. Die
Korrelation des Tonklassenprofils gegen ihre 24 Profile ergibt die Tonart, dazu
den Camelot-Code und die Nachbarn, die harmonisch dazu passen.

Parallele Dur- und Moll-Tonarten enthalten dieselben zwölf Töne. Das Profil
allein kann sie deshalb nicht trennen — was sie unterscheidet, ist welcher Ton
sich wie ein Grundton verhält. Dafür kommen zwei Indizien dazu: die Basslage und
der Anfang des Stücks. Bleibt es knapp, sagt die Oberfläche das und nennt die
Alternative, statt eine Zahl zu erfinden.

**Audio zu MIDI.** FL Studio hat das nicht eingebaut. Hier verfolgt YIN (de
Cheveigné und Kawahara, 2002) die Tonhöhe Rahmen für Rahmen; daraus werden Noten
gebildet und als Standard-MIDI-Datei geschrieben, die jedes DAW öffnet.

Die Verfolgung ist bewusst einstimmig. Ein mehrstimmiger Transkriptor braucht
ein trainiertes Modell und einen entsprechenden Download; eine einzelne Linie —
Bass, Hook, Gesang — ist ohnehin das, was man heraushören will. Auf einem vollen
Mix findet er die auffälligste Stimme statt der gewünschten, deshalb steht im
Panel der Hinweis, vorher im Reiter „Spuren“ zu trennen.

**Akkorde** werden über dieselben Tonklassen gegen Dreiklang-Vorlagen
abgeglichen. Dabei gibt es eine Falle: eine einzelne Note buchstabiert mit ihren
Obertönen selbst einen Durdreiklang, sodass naives Vorlagen-Matching jeder
Durchgangsnote einen Akkord anhängt. Der Ausweg ist ein Vergleich — erklärt eine
einzelne Tonklasse das Fenster deutlich besser als der beste Dreiklang, ist es
eine Melodie und kein Akkord. Gemessen an synthetischem Material liegt eine
Solostimme bei einem Verhältnis von 1,23 bis 1,48, Akkorde unter einer Melodie
bei 0,86 bis 1,11; die Grenze liegt dazwischen.

Beides rechnet lokal, ohne Modell und ohne Download.

## Eigenes Trennmodell verwenden

Sondra liefert keine Modellgewichte mit; ein Demucs-Export wiegt Hunderte
Megabyte, die sonst jeder Besuch mitlädt. Im Panel „Spuren“ lässt sich eine
`.onnx`-Datei wählen. Der Läufer liest Rang und Form der Ein- und Ausgabe aus
den Session-Metadaten und wählt danach:

- **Rang 3** `[1, Kanäle, Samples]` → Wellenform-Modell, überlappende
  Hann-Fenster mit gewichteter Überlagerung.
- **Rang 4** `[1, Kanäle, Frequenz, Zeit]` → Maskenmodell; die Phase stammt aus
  dem Original.

WebGPU wird zuerst versucht, WASM ist der Rückfall. Die ONNX-Laufzeit wird
dynamisch importiert — wer die Funktion nie benutzt, lädt sie nie.

## Bekannte Grenzen

- **Portale mit CORS-Sperre** (YouTube und ähnliche) lassen sich nur über den
  ausdrücklich einzuschaltenden Extraktions-Dienst laden — und dann nicht mehr
  lokal. Ohne eigene Instanz funktioniert die Funktion nicht.
- **AES-verschlüsselte HLS-Streams** werden abgelehnt. Sondra lädt keine
  Schlüssel und umgeht keinen Kopierschutz.
- **Die eingebaute Spurentrennung erreicht kein Demucs.** Sie ist gut genug für
  Karaoke, Remix-Vorarbeit und das Herauslösen von Schlagzeug.
- **Mono-Material** liefert schlechtere Trennung: ohne Stereobild fehlt die
  Mitteninformation, aus der sich der Gesang ableiten ließe.
- **Das Bündel ist groß.** Beide FFmpeg-Cores und die ONNX-Laufzeit summieren
  sich auf rund 90 MB in `dist/`. Geladen wird davon nur, was benutzt wird — ein
  Besuch, der bloß die Seite ansieht, holt unter 400 KB.

## Lizenz und Herkunft

FFmpeg (WebAssembly-Portierung: ffmpeg.wasm), ONNX Runtime Web, Wavesurfer.js
und Tone.js sind quelloffene Projekte unter ihren jeweiligen Lizenzen. Die
Schriften Cormorant Garamond und Inter stehen unter der SIL Open Font License
und liegen als Latin-Teilmenge im Repository.
