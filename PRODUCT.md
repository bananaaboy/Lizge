# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primär: **Musikerinnen und Musiker, die selbst produzieren.** Sie kommen mit
eigenen Aufnahmen und einer konkreten Aufgabe — Spuren trennen, Tonart und
Tempo bestimmen, an Anschlägen zerschneiden, Lautheit prüfen, einen Schnitt
setzen. Sie kennen die Begriffe (LUFS, True Peak, Stems, BPM, Camelot) und
brauchen sie nicht erklärt.

Die Seite ist öffentlich erreichbar, also trifft sie auch **Fremde, die über
eine Suche kommen** und nichts von ihr wissen. Diese Gruppe ist nicht das
Ziel, aber sie ist real: sie muss in wenigen Sekunden verstehen können, was
das ist und warum es im eigenen Browser rechnet, sonst geht sie wieder.

Sprache ist durchgehend Deutsch.

## Product Purpose

Medien bearbeiten, ohne sie herzugeben. Ton, Video und Bilder werden
vollständig im Browser-Tab verarbeitet — umwandeln, schneiden, trennen,
messen, zerlegen, analysieren — ohne Konto, ohne Installation und ohne
Upload. Erfolg heißt: jemand erledigt seine Aufgabe und keine seiner Dateien
hat das Gerät verlassen.

## Positioning

Zwei Dinge zusammen, die es einzeln oft gibt und zusammen selten:

1. **Es rechnet wirklich lokal.** FFmpeg als WebAssembly, ONNX Runtime für die
   Spurentrennung, eigene DSP für Lautheit, Tonart und Tempo. Es gibt keinen
   Upload-Endpunkt. Das ist überprüfbar und nicht bloß eine Zusage in einer
   Datenschutzerklärung.
2. **Es hat Werkzeuge für Musiker,** nicht nur einen Formatwandler:
   Spurentrennung, EBU-R128-Lautheit, Tonart/Tempo/Akkorde/MIDI,
   Zerschneiden an Anschlägen.

Die eine Ausnahme — das Herunterladen von einer Adresse — wird benannt, statt
sie unter den Teppich zu kehren.

## Operating Context

Jemand sitzt an einem Laptop, hat eine Datei auf der Festplatte oder eine
Adresse in der Zwischenablage, und will eine Sache damit tun. Danach
möglicherweise noch eine zweite mit dem Ergebnis.

Die Sitzung lebt ausschließlich im Arbeitsspeicher des Tabs: kein
localStorage, keine IndexedDB, keine Cookies. Den Tab zu schließen ist die
Löschtaste. Große Dateien gehen beim Speichern direkt auf die Festplatte, wo
der Browser das erlaubt.

## Capabilities and Constraints

**Werkzeuge:** Herunterladen · Umwandeln · Ton bearbeiten · Video bearbeiten ·
Bilder bearbeiten · Spuren trennen · Lautstärke messen und angleichen ·
Zerschneiden (Sampler) · Tonart, Tempo, Akkorde und Melodie als MIDI.

**Technische Bedingungen:**

- FFmpeg läuft als WebAssembly; mehrfädig nur bei Cross-Origin-Isolation
  (COOP `same-origin` + COEP `credentialless`), sonst einfädig und langsamer.
- Der WASM-Kern ist rund 30 MB und wird beim Start geholt; ohne ihn geht ein
  Teil der App trotzdem.
- Bilder laufen über die Canvas-API, nicht über FFmpeg: PNG, JPEG und WebP
  können geschrieben werden, AVIF und TIFF nur gelesen.
- YouTube liefert einem Server nur die progressive Spur (in der Regel 360p);
  alles darüber läuft über SABR und hat keine abrufbare Adresse. Gemessen,
  auch mit gültigem PoToken.

**Rechtliches, bindend:** Nur zulässige Downloads. Keine DRM-Umgehung. Der
Weg über den Proxy und der Haftungsausschluss stehen sichtbar im Downloader,
bevor etwas eingegeben wird.

**Bereitstellung:** statisch auf Vercel unter lizge.ch, dazu zwei kleine
Funktionen unter `api/`. Es wird kein fremder Anbieter fest verdrahtet.

## Brand Commitments

- **Name:** Sondra.
- **Logo und Wortmarke bleiben unverändert** — die gestapelten Balken und der
  Schriftzug. Bindend.
- **Stimme:** Deutsch, Sie-Form, nüchtern. Keine Werbesprache, keine
  Superlative, keine Versprechen ohne Beleg. Texte dürfen umformuliert
  werden, der Ton nicht.
- **Alle heutigen Werkzeuge bleiben erreichbar.** Keines fällt weg, keines
  wird versteckt.
- **Der Hinweis, dass allein der Downloader nicht lokal läuft, bleibt
  sichtbar und ungeschönt.**
- Vom Nutzer als bindend genannte visuelle Festlegung: **die heutigen Farben**
  (Papierweiß `#f4f3ee`, Forest Ink `#0f3e1c`, der dunkle Modus) bleiben.

## Evidence on Hand

Echte Belege: das Werkzeug selbst, die Messungen im Repository (README), Logo
und Favicon unter `public/`.

**Es gibt keine** Kundenstimmen, Referenzen, Nutzerzahlen, Auszeichnungen,
Presseberichte oder Vergleichsmessungen gegen andere Produkte. Diese dürfen
nicht erfunden werden — auch nicht als Platzhalter.

## Product Principles

1. **Die Datei verlässt das Gerät nicht.** Jede Ausnahme wird benannt, bevor
   sie eintritt, nicht danach.
2. **Zeigen statt behaupten.** Wo eine Zahl genannt wird, ist sie gemessen —
   Dateigröße, Lautheit, Dauer. Keine Schätzung, die wie ein Messwert aussieht.
3. **Fachsprache ist erlaubt,** weil die Nutzer sie sprechen. Der einfache Weg
   bleibt trotzdem offen für den, der sie nicht spricht.
4. **Nichts wird versteckt.** Jedes Werkzeug ist von überall aus erreichbar;
   Tiefe liegt hinter einer Aufklappung, nicht hinter einem Umweg.
5. **Keine Behauptung ohne Beleg.** Was das Projekt nicht hat — Nutzerzahlen,
   Stimmen, Vergleiche — wird auch nicht angedeutet.

## Accessibility & Inclusion

Im Projekt bereits festgelegt und bindend:

- Kontrast wird gemessen, nicht geschätzt: APCA Lc ≥ 75 für Fließtext, ≥ 60
  für sekundären Text, ≥ 45 für Überschriften, ≥ 15 für Trennlinien.
- Jede Bedienung ist mit der Tastatur erreichbar; der Fokusring ist sichtbar
  und nie ausgeschaltet.
- `prefers-reduced-motion` schaltet jede Bewegung ab.
- Deutsche Fließtexte brauchen Platz: lange Komposita vertragen keine
  gequetschten Zeilen.
