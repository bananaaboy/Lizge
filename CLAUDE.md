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
Formensprache sind neu. Die Welt ist ein **Schweizer Prüfprotokoll**: das
Produkt behauptet als Einziges, dass jede Zahl gemessen statt geschätzt ist,
und ein Prüfbericht ist die Dokumentform, deren einziger Zweck genau das ist.

Das Wenige, was hier stehen muss, weil es jeden Edit betrifft:

- **Keine Karten, keine Rundungen, kein Schatten auf dem Blatt.** Abschnitte
  trennt eine Linie und Luft. Die eine Schattenstufe gehört dem, was wirklich
  über dem Blatt schwebt: Editor-Platte, Popover, Ablage-Overlay.
- **Zwei Schriften, semantisch getrennt.** Public Sans setzt das gedruckte
  Formular, Courier Prime das, was die Maschine eingetragen hat — Messwerte,
  Dateinamen, Timecodes. Nie Mono als Kostüm für „technisch". Cormorant lebt
  für genau ein Wort weiter: die Wortmarke ist eine bindende Zusage.
- **Klauselnummern sind Adressen.** Sie stammen aus einer festen Liste, nie
  aus der gefilterten Renderreihenfolge, sie verlinken auf sich selbst, und
  `location.hash` wird beim Laden aufgelöst. Eine Nummer, die das nicht kann,
  gehört gelöscht — der Qualitätsboden verbietet dekorative Abschnittsnummern.
- **Zustand ist eine Marke am Rand,** kein Satz: `—` nicht gemessen, `●`
  gemessen, `!` ausserhalb der Toleranz.
- **Kontrast wird gemessen, nicht geschätzt.** APCA: Fliesstext ≥ Lc 75,
  sekundär ≥ 60, Überschriften ≥ 45, Nicht-Text ≥ 15. Eine Palettenänderung
  ist erst fertig, wenn sie durch die Zahlen gelaufen ist.
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
