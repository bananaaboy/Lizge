# Sondra

Deutschsprachiges Medienstudio, das im Browser rechnet. Vite 7 · React 19 ·
TypeScript · Tailwind v4 · zustand. Oberflächentexte sind **Deutsch**,
Codekommentare **Englisch**.

Wer das Produkt sucht — Publikum, Hauptaufgabe, die gesetzten Einschränkungen
und die gemessenen Grenzen, die Versprechen begrenzen — findet es in
[PRODUCT.md](PRODUCT.md). Diese Datei hier hält die gestalterischen
Entscheidungen, und zwar als einzige: zwei Regeldateien driften auseinander und
ziehen spätere Arbeit in verschiedene Richtungen.

## Design

**Die gestalterischen Entscheidungen stehen in [DESIGN.md](DESIGN.md).** Eine
massgebliche Datei je Sache — Produktwahrheit in `PRODUCT.md`, visuelle Welt in
`DESIGN.md`, Betrieb hier. Zwei Kopien derselben Regel driften auseinander, und
die veraltete gewinnt dann den nächsten Edit.

Am 20.9.2026 wurde die visuelle Welt mit Impeccable **ersetzt**, nicht
aufpoliert. Nur die Farben waren gesetzt; Typografie, Aufbau, Raster und
Formensprache sind neu: ein ruhiges, flaches Blatt — keine Kästen, keine
Rundungen, kein Schatten; getrennt wird mit Linie und Luft.

Der erste Wurf nahm die Messhaltung zu wörtlich und setzte die Oberfläche in
die Sprache eines Eichscheins: „Prüfgegenstand", „Verfügbare Verfahren", eine
Klauselnummer auf jeder Überschrift, ein leeres Formular als Einstieg. Noch am
selben Tag zurückgebaut, nachdem der Nutzer es gesehen hatte. Die Lehre steht
hier, weil sie jeden weiteren Edit betrifft: **das Messen gehört in die Art,
wie Zahlen berichtet werden, nicht in die Wörter auf der Tür.**

Das Wenige, was hier stehen muss, weil es jeden Edit betrifft:

- **Keine Karten, keine Rundungen, kein Schatten auf dem Blatt.** Abschnitte
  trennt eine Linie und Luft. Die eine Schattenstufe gehört dem, was wirklich
  über dem Blatt schwebt: Editor-Platte, Popover, Ablage-Overlay.
- **Klartext, kein Amtston.** Überschriften heissen, was sie sind —
  „Werkzeuge", nicht „Verfügbare Verfahren". Sie-Form und nüchterner Ton
  bleiben; Behördendeutsch war nie dasselbe wie Sachlichkeit.
- **Werkzeuge sind Kacheln.** Die dreissig Werkzeuge stehen als Kachelfeld,
  nach Gruppen geordnet und über ein Feld filterbar — ausdrücklich so
  gewünscht. Eine getönte Fläche gibt der Kachel ihre Kante, kein Rahmen und
  kein Schatten.
- **Der Einstieg zeigt die nächste Handlung,** nicht den Zustand der leeren
  Sitzung. Ohne Datei steht dort, was die Seite kann und der Knopf, der sie
  startet — kein Formular mit leeren Feldern.
- **Zwei Schriften, semantisch getrennt.** Public Sans setzt die Oberfläche,
  Courier Prime das, was die Maschine eingetragen hat — Messwerte,
  Dateinamen, Timecodes. Nie Mono als Kostüm für „technisch". Cormorant lebt
  für genau ein Wort weiter: die Wortmarke ist eine bindende Zusage.
- **Zustand ist eine Marke am Rand,** kein Kasten: `Notice` annotiert mit
  `●` und `!`, statt den Hinweis einzurahmen.
- **Kontrast wird gemessen, nicht geschätzt.** APCA: Fliesstext ≥ Lc 75,
  sekundär ≥ 60, Überschriften ≥ 45, Nicht-Text ≥ 15. Eine Palettenänderung
  ist erst fertig, wenn sie durch die Zahlen gelaufen ist — und eine getönte
  Fläche verschiebt den Grund, auf dem gemessen wurde.
- **Keine Eyebrows.** Ausnahmslos gebannt, auch als Platzhalter. Eine
  Überschrift trägt sich selbst. Versalien gibt es nur im `Badge`.
- **Kein Bauteil ohne Fehler-, Leer-, Lade-, Fokus- und Deaktiviert-Zustand.**

Vor einer Gestaltungsänderung: `DESIGN.md` lesen. Das Skill dazu liegt unter
`.claude/skills/impeccable/`; der Richtungsvertrag mit dem Seed-Key steht in
`.impeccable/surfaces/src-app-tsx.md`.

## Betrieb

- `npm run dev` · `npm run build` · `npm run typecheck`
- `npm run dev:service` serviert `dist/` zusammen mit den Funktionen unter
  `api/`, was `vite preview` nicht kann — nötig, um den Downloader lokal
  durchzuspielen.
- Umgebungsvariablen der Bereitstellung:
  - `SONDRA_SECRET` — signiert die Adressen, die der Proxy weiterreicht.
  - `SONDRA_PROVIDER_URL` — ein cobalt-kompatibler Anbieter. Ist einer
    hinterlegt, wird er zuerst gefragt und liefert volle Auflösung und die
    Portale, für die es hier keinen Extraktor gibt. Ohne ihn bleibt YouTube auf
    der progressiven Spur (in der Regel 360p).
  - `SONDRA_PROVIDER_KEY` — dessen `Api-Key`, falls verlangt.
- **Kein Anbieter wird fest verdrahtet.** Eine fremde Instanz im Code würde
  jede eingegebene Adresse an Dritte schicken, die niemand ausgesucht hat.
