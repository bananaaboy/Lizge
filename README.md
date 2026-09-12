# Lizge

Ein Medienstudio, das öffentlich im Internet steht und trotzdem nichts hochlädt.
Der Server liefert HTML, JavaScript und WebAssembly aus — danach rechnet
ausschließlich der Rechner des Besuchers.

| | |
|---|---|
| **Downloader** | Direkte Links, HLS-Playlisten und — auf Wunsch — Portale |
| **Konverter** | FFmpeg als WebAssembly, zehn Ausgabeformate |
| **Spurentrennung** | Gesang, Schlagzeug, Bass, Übriges — ohne Modell-Download |
| **Lautheit** | Vollständiges EBU R128 / ITU-R BS.1770-4 mit True-Peak-Grenze |
| **Chopper** | Chops an Transienten oder im Tempo-Raster, 16 Pads, Sample-Pack |
| **Harmonie** | Tonart mit Camelot-Code, Akkordverlauf, Melodie als MIDI |

Das Harmonie-Panel hat zwei Ansichten: „Einfach“ zeigt Tempo, Tonart und
Camelot-Code und sonst nichts, „Detail“ zusätzlich Akkorde, Tonklassen, die
Melodie und alle Einstellungen. Einfach überspringt die Tonhöhenverfolgung, den
teuren Teil, weil sie dort ohnehin nicht gezeigt wird.

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
Lizge/
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

### Eine Instanz für den eigenen Rechner

Eine Webseite kann keinen Server auf dem Rechner starten, der sie anzeigt — und
das ist keine Lücke, sondern der Grund, warum man Webseiten überhaupt öffnen
kann. Die Anwendung geht deshalb so weit, wie eine Seite ehrlich gehen kann:

* Wird der Schalter umgelegt, sieht die Seite zuerst **von selbst** auf diesem
  Rechner nach. Läuft dort schon etwas, ist die Einrichtung damit vorbei — ohne
  einen einzigen Klick. Gesucht wird ausschließlich lokal: eine gemerkte fremde
  Adresse wird eingetragen, aber nicht ungefragt angesprochen, denn genau
  darüber soll der Schalter ja entscheiden.
* Ist nichts da, stehen zwei Wege nebeneinander, der kürzere zuerst: eine
  vorhandene Adresse eintragen, oder einen Dienst auf diesem Rechner starten.
  Keiner davon ist hinter einem Link versteckt — ein Schritt, den man nicht
  sieht, ist ein Schritt, den man nicht geht.
* „Befehl kopieren“ legt den `docker run`-Befehl in die Zwischenablage und
  **wartet danach**. Der Schritt, an dem es sonst scheitert, ist nicht der
  Befehl, sondern die Rückkehr zur Seite: Man weiß nicht, was man drücken soll.
  Also muss nichts gedrückt werden — die Seite schaut alle zwei Sekunden nach
  und verbindet sich selbst, sobald der Dienst antwortet.
* Darunter liegen weiterhin die fertige `docker-compose.yml`, ein Startskript
  für macOS und Linux und eines für Windows. Alles wird im Browser geschrieben,
  nichts nachgeladen, und es ist lesbarer Text — den man vor dem Ausführen auch
  lesen sollte, bei allem, was eine Webseite einem gibt.
* Die Konfiguration bindet an `127.0.0.1`, nicht an `0.0.0.0`: eine Instanz auf
  einem Laptop hat im WLAN eines Cafés nichts zu suchen.
* Der Zustand steht immer in einer Zeile über allem anderen: verbunden mit wem,
  oder dass noch kein Dienst da ist und YouTube-Links deshalb nicht gehen.
  Einstellungen wie Auflösung und Zugangsschlüssel erscheinen erst, wenn es
  etwas gibt, auf das sie sich beziehen.

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

Über das Manifest lässt sich Lizge installieren. Der Knopf erscheint nur, wenn
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

Lizge liefert keine Modellgewichte mit; ein Demucs-Export wiegt Hunderte
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
- **AES-verschlüsselte HLS-Streams** werden abgelehnt. Lizge lädt keine
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
