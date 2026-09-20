---
name: Sondra
description: Ein Medienstudio, das im Tab rechnet — Schweizer Messinstrument auf warmem Papier.
colors:
  canvas: "#f4f3ee"
  raised: "#ffffff"
  panel-soft: "#eaf2e9"
  panel-mid: "#e2ebe1"
  panel-strong: "#d2e4d1"
  panel-cool: "#e4edef"
  ink: "#0f3e1c"
  ink-hover: "#0a2b13"
  on-ink: "#ffffff"
  prose: "#1b231d"
  muted: "#5d6c61"
  line: "#d5d4c9"
  stage: "#15181a"
  stage-soft: "#1d2124"
  stage-line: "#515a5d"
  stage-ink: "#eef1f0"
  stage-muted: "#aab5b2"
typography:
  display:
    fontFamily: "Faire Octave, Cormorant Garamond, ui-serif, Georgia, serif"
    fontSize: "clamp(31px, 4vw, 39px)"
    fontWeight: 300
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Faire Octave, Cormorant Garamond, ui-serif, Georgia, serif"
    fontSize: "25px"
    fontWeight: 300
    lineHeight: 1.25
  title:
    fontFamily: "Suisse Intl, Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.35
  body:
    fontFamily: "Suisse Intl, Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  small:
    fontFamily: "Suisse Intl, Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Suisse Intl, Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "0.08em"
rounded:
  nav: "7px"
  card: "14px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
    textColor: "{colors.on-ink}"
  button-quiet:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: "12px 20px"
  button-quiet-hover:
    backgroundColor: "{colors.panel-soft}"
    textColor: "{colors.ink}"
  card:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.prose}"
    rounded: "{rounded.card}"
    padding: "24px"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.prose}"
    typography: "{typography.body}"
    rounded: "{rounded.nav}"
    padding: "12px 16px"
  chip:
    backgroundColor: "{colors.panel-soft}"
    textColor: "{colors.prose}"
    typography: "{typography.small}"
    rounded: "{rounded.nav}"
    padding: "8px 12px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
  tool-row:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.small}"
    padding: "12px 16px"
---

# Design System: Sondra

> Überschriften englisch, weil Werkzeuge sie genau so parsen; Inhalt deutsch wie
> in [PRODUCT.md](PRODUCT.md) und [CLAUDE.md](CLAUDE.md). Die **Tokens im
> Frontmatter sind normativ** — die Prosa erklärt, wo und warum sie gelten, und
> wiederholt keinen Wert.
>
> Verhaltensregeln und die harten Verbote stehen **nicht** hier, sondern in
> CLAUDE.md, weil Claude Code diese Datei bei jeder Sitzung automatisch liest
> und DESIGN.md nicht. Bei Widerspruch gewinnt für Werte dieses Dokument, für
> Verbote CLAUDE.md.

## Overview

**Creative North Star: „Schweizer Messinstrument auf warmem Papier"**

Sondra ist ein Werkzeug, kein Schaufenster. Man kommt mit einer Datei und einem
Vorhaben, und jeder Bildschirm ist dafür da, dieses Vorhaben auszuführen. Das
ist die ganze Begründung für die Dichte: 13px Bedienelemente, Tabellenziffern in
jeder Anzeige, Regler direkt neben dem, worauf sie wirken. Nichts wird hier
damit gerechtfertigt, dass es beeindruckend aussieht.

Das Papier ist die zweite Hälfte. Die Fläche ist kein kaltes Grau, sondern ein
warmes Cremeweiss, auf dem weisse Karten wirklich liegen — und die einzige
gesättigte Farbe im ganzen Aufbau ist ein dunkles Waldgrün, das ausschliesslich
eines bedeutet: *hier kannst du etwas tun*. Weil es selten ist, trägt es. Die
Anzeigeschrift ist eine Renaissance-Antiqua im leichtesten Schnitt; sie ist der
einzige Ort, an dem dieses Werkzeug etwas über sich selbst sagt.

Die dritte Fläche widerspricht beiden mit Absicht: die Bühne der Editoren ist
ein neutrales Dunkel. Ein Bild, das gegen Creme beurteilt wird, liest sich warm;
gegen Grün liest es sich kalt. Die eine Fläche, deren Aufgabe es ist, über
Farben nicht zu lügen, ist die, auf der man sie bearbeitet.

**Key Characteristics:**
- Ein einziger Akzent, der eine einzige Bedeutung hat
- Dichte als Respekt vor jemandem, der arbeitet — nicht als Sparsamkeit
- Gemessene Kontraste statt Augenmass
- Eine Linie auf einer Seite, wo andere eine Kiste bauen
- Zwei Schriften mit klarer Arbeitsteilung, sechs Grössen, kein Zwischenschritt

## Colors

Warmes Papier und gebrochenes Weiss tragen fast alles; ein einziges Grün
markiert, was anklickbar ist; eine neutrale Dunkelfläche trägt die Bildbühne.

### Primary
- **Waldtinte** (`ink`): die einzige gesättigte Farbe. Gefüllte Schaltflächen,
  der aktive Reiter, Überschriften, der Fokusring, der ausgewählte Chip. Nie als
  Grund unter einer ganzen Fläche.
- **Waldtinte gedrückt** (`ink-hover`): ausschliesslich der Hover-Zustand
  gefüllter Flächen.

### Neutral
- **Warmes Papier** (`canvas`): die Seite selbst.
- **Karte** (`raised`): reines Weiss, ausschliesslich für Dinge, die auf dem
  Papier *liegen*.
- **Blasse Minze** (`panel-soft`, `panel-mid`, `panel-strong`): getönte Blöcke,
  die *in* einer Karte sitzen. Flach, randlos, nie das äusserste Element eines
  Bildschirms.
- **Kühle Minze** (`panel-cool`): reserviert für den Hinweis, dass etwas nicht
  lokal läuft. Die einzige Tönung mit einer Bedeutung.
- **Prosa** (`prose`) und **Gedämpft** (`muted`): Fliesstext und Sekundärtext.
- **Linie** (`line`): jede Trennung, egal ob Haarlinie oder Kartenrand.

### Tertiary
- **Bühne** (`stage`, `stage-soft`, `stage-line`, `stage-ink`, `stage-muted`):
  die Editor-Fläche und alles, was darauf schwimmt. Bewusst neutral, in beiden
  Themen nahezu identisch.

### Named Rules

**Die Ein-Stimme-Regel.** Der Akzent liegt auf höchstens einem Zehntel eines
Bildschirms. Liegt er auf jedem dritten Element, ist er kein Akzent mehr,
sondern Dekoration — und dann zeigt nichts mehr auf das, was man tun kann.

**Die Messregel.** Kontrast wird gerechnet, nicht geschätzt. APCA: Fliesstext
≥ Lc 75, Sekundärtext ≥ Lc 60, Überschriften ≥ Lc 45, Nicht-Text ≥ Lc 15. Eine
Palettenänderung ist nicht fertig, bevor sie durch die Zahlen gelaufen ist.
Diese Regel hat eine dunkle Linienfarbe bei Lc 0,0 gefunden — unsichtbar, auf
genau dem Token, das jeden Container der App trennt.

**Die Dunkelmodus-Regel.** Dunkel ist eine eigene Abbildung mit eigenem
Kontrastdurchgang, nie eine Invertierung. Dort tauschen Tinte und Grund die
Rollen: der Akzent muss die *helle* Farbe sein, sonst verschwinden Überschriften
und gefüllte Schaltflächen.

## Typography

**Display Font:** Faire Octave, ersatzweise Cormorant Garamond (Georgia, serif)
**Body Font:** Suisse Intl, ersatzweise Archivo (system-ui, sans-serif)
**Mono:** ui-monospace (SF Mono, JetBrains Mono, Menlo) — nur Protokoll und
FFmpeg-Befehle

**Character:** Eine Renaissance-Antiqua im Gewicht 300 gegen eine Grotesk der
Schweizer Linie. Die Antiqua spricht, die Grotesk arbeitet. Archivo ist nicht
beliebig gewählt: eckige Endungen und echte Tabellenziffern sind das, was ein
Werkzeug voller dB, LUFS, BPM und Timecodes tatsächlich braucht — und es ist
ausdrücklich nicht Inter, die Schrift, zu der jede generierte Oberfläche greift.

### Hierarchy
- **Display** (300, clamp 31–39px, 1.2): die eine grosse Zeile pro Bildschirm.
  Die Anzeigeschrift erscheint nur im Gewicht 300, mit Laufweite, die sich mit
  der Grösse zuzieht.
- **Headline** (300, 25px, 1.25): Abschnittsüberschriften in Karten.
- **Title** (400, 20px, 1.35): Zwischenüberschriften, Dateinamen im Editorkopf.
- **Body** (400, 16px, 1.55): Fliesstext, primäre Bedienelemente, Eingabefelder.
  16px ist eine deutsche Entscheidung: die Wörter sind lang.
- **Small** (400, 13px, 1.5): die dichte Werkzeugleiste — Anzeigen, Hinweise,
  Chips, Reiter, Statuszeilen.
- **Label** (600, 11px, 0.08em, versal): die **einzige**
  Grossbuchstaben-Behandlung im System.

### Named Rules

**Die Sechs-Stufen-Regel.** Die Skala ist eine grosse Terz (×1.25) ab 16px und
hat genau sechs Stufen. Dazwischen gibt es nichts. Frühere Fassungen hatten 9,
10, 10.5, 11, 12, 13, 13.5 und 14px gleichzeitig im Einsatz — Grössen, die einen
Pixel auseinanderliegen, sind keine Hierarchie, sondern eine nicht getroffene
Entscheidung. Nie eine Pixelgrösse von Hand schreiben; immer das Token.

**Die Ergebnis-Regel.** Beschriftungen benennen das Ergebnis, nicht die Technik.
„Spuren trennen" steht über dem, was anderswo „Source Separation" heisst. Wer
mit einer Aufnahme und einer Frage ankommt, kennt das Fachwort noch nicht.

## Layout

Ein **4-px-Raster**: jeder Abstand, jeder Innenabstand, jede Lücke ist ein
Vielfaches von vier; 2px existiert als halber Schritt für Haarlinien-Versätze
und sonst nichts. Die Inhaltsbreite beträgt maximal 1280px bei 21px seitlicher
Luft.

Die Editoren folgen der Form, auf die alle Editoren zulaufen: Werkzeugleiste
links (84px), Bühne in der Mitte, Regler des gewählten Werkzeugs rechts (288px),
Status unten. **Die Bühne bewegt sich nie und scrollt nie.** Unter `lg` wird die
Leiste zu einer waagrechten Reihe unter der Bühne und die Regler rutschen
darunter — die Reihenfolge bleibt: sehen, wählen, einstellen.

Die Bühne wird in JavaScript vermessen, also braucht sie eine Höhe, die
wirklich existiert: ihre Inhalte sind absolut positioniert, nicht geflossen. Ein
Kind mit `h-full` in einem Elternteil, dessen Höhe aus `min-height` stammt, löst
zu `auto` auf — auf dem Telefon wurde ein Foto so vierzig Pixel breit
gezeichnet.

### Named Rules

**Die Mehr-für-Wichtiges-Regel.** Ein System ist nicht dasselbe wie
Gleichförmigkeit. Um das, was mehr zählt, steht mehr Raum — nicht überall
derselbe Abstand.

## Elevation & Depth

Das System ist fast flach und arbeitet mit Tönung statt mit Schatten. Es gibt
**genau zwei** Schattenstufen, und beide haben eine Bedeutung: die eine heisst
„das hier liegt auf dem Papier", die andere „hierauf zeigt gerade jemand".
Nichts sonst bekommt einen Schatten.

Tiefe wird ansonsten durch Flächenwechsel erzeugt: Papier → Karte → getönter
Block. Eine Karte ist weiss auf Creme und braucht deshalb keinen Rahmen, um als
Objekt gelesen zu werden.

### Shadow Vocabulary
- **Karte** (`0 1px 2px rgb(20 35 25 / 0.04), 0 4px 16px -8px rgb(20 35 25 / 0.1)`):
  hebt eine Karte vom Papier ab. Der Ruhezustand.
- **Angehoben** (`0 2px 6px rgb(20 35 25 / 0.06), 0 12px 30px -12px rgb(20 35 25 / 0.18)`):
  Antwort auf den Zeiger oder auf Ziehen. Nie im Ruhezustand.

### Named Rules

**Die Eine-Stufe-tief-Regel.** Tiefe geht genau einen Schritt. Eine Karte liegt
auf dem Papier; alles Getönte sitzt flach darin und stapelt sich nicht weiter.

## Shapes

Drei Radien und keiner dazwischen: `nav` (7px) für Bedienelemente,
Eingabefelder und Chips, `card` (14px) für Karten und Flächen, `pill` (999px)
für Punkte, Abzeichen und Schalter. Keine weicheren Ecken — 24px und mehr
verwandelt Rechtecke in Blasen.

Die Bühne durchbricht das bewusst: das Bild darauf hat 2px Radius, praktisch
eine Kante, weil ein gerundetes Foto eine Behauptung über das Foto wäre.

### Named Rules

**Die Eine-Linie-Regel.** Ein Rahmen auf allen vier Seiten behauptet: *das hier
ist ein Objekt, das auf einer Fläche liegt.* Das stimmt für eine Karte und fast
nichts sonst. Eine Zeile in einer Liste, ein Abschnitt, ein Block, der ohnehin
schon in einer Karte steckt: eine **einzige Haarlinie auf der Seite**, die dem
zugewandt ist, wovon getrennt wird. Die Reihenfolge lautet Weissraum →
Flächenwechsel → eine Linie → und erst für ein echtes Objekt vier Seiten plus
eine Schattenstufe.

## Components

### Buttons
- **Shape:** dieselbe Rundung wie eine Karte (14px) — Schaltflächen sind hier
  Objekte, keine Etiketten.
- **Primary:** gefülltes Waldgrün mit Kartenschatten. Eine primäre Aktion pro
  Bereich.
- **Quiet:** weiss mit eingesetzter Haarlinie. Die zweite Wahl, die sichtbar die
  zweite ist.
- **Ghost:** transparent, nur Text; wird beim Hover zu blasser Minze.
- **Hover / Focus:** Farbe wechselt über 130ms; auf Zeigergeräten sinkt die
  Fläche beim Drücken um 1px. Fokus ist immer der 2px-Tintenring mit 2px
  Versatz, nie ein Browser-Blau.
- **Disabled:** 40 % Deckkraft, `cursor: not-allowed`, kein Hover-Wechsel.

### Chips
- **Style:** blasse Minze mit Haarlinie, dichte Schriftgrösse. Für „eins aus
  vier" — Seitenverhältnisse, Formate, Tempi.
- **State:** ausgewählt ist gefülltes Grün, gesetzt über `aria-pressed`. Drei
  Viertel aller Regler in den Editoren sind „wähle eins aus vier"; ein
  Auswahlmenü würde drei davon hinter einen Klick verstecken.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** weiss auf Papier.
- **Shadow Strategy:** genau die Kartenstufe, siehe Elevation & Depth.
- **Border:** eine eingesetzte Haarlinie, weil die Karte ein Objekt ist.
- **Internal Padding:** 24px, dicht 16px.

### Inputs / Fields
- **Style:** weiss, eingesetzte Haarlinie, Navigationsradius.
- **Focus:** der Ring wechselt von Linie zu Tinte — die Fläche springt nicht.
- **Size:** Fliesstextgrösse (16px), was nebenbei verhindert, dass iOS beim
  Fokussieren hineinzoomt.

### Navigation
- **Style:** waagrechte Reiterleiste in einer weissen Leiste, dichte
  Schriftgrösse, Navigationsradius; der aktive Reiter ist gefülltes Grün.
- **Overflow:** die Leiste scrollt seitlich, und an den Rändern, hinter denen
  noch etwas liegt, liegt ein Verlauf — nur dort, wo es etwas zu scrollen gibt.
- **Keyboard:** Pfeiltasten wechseln das Werkzeug; die Auswahl scrollt sich
  selbst in den Blick.

### Tool row (Signature)
Die Werkzeugliste auf dem Startbildschirm: Symbol auf der Beschriftungszeile,
Hinweis darunter, getrennt durch **eine** Linie oben. Kein Kasten pro Eintrag,
kein Kasten um die Gruppe — die Linie über dem ersten Eintrag ist zugleich die
Oberkante der Gruppe. Eine leere Rasterzelle am Ende zeichnet gar nichts.

### Editor stage (Signature)
Dunkle, neutrale Fläche mit Schachbrett für Transparenz — die einzige Stelle, an
der ein dekoratives Muster seine Berechtigung hat, weil es der einzige Weg ist,
„dieses Pixel ist durchsichtig" von „dieses Pixel ist grau" zu unterscheiden.
Bedienelemente darauf schwimmen in einer Pille aus der Bühnenfarbe mit
Unschärfe.

## Do's and Don'ts

### Do:
- **Do** den Akzent für genau eine Bedeutung verwenden: *hier kannst du etwas
  tun*. Höchstens ein Zehntel eines Bildschirms.
- **Do** jede Grösse aus den sechs Typo-Tokens nehmen und jeden Abstand aus dem
  4-px-Raster.
- **Do** Kontraste rechnen, bevor eine Palettenänderung als fertig gilt.
- **Do** Listenzeilen mit **einer** Linie trennen und Karten für echte Objekte
  reservieren.
- **Do** jeden Zustand entwerfen: Fehler, leer, lädt, Fokus, deaktiviert. Eine
  Oberfläche ohne sie ist unfertig, sobald ein echter Mensch sie anfasst.
- **Do** Bewegung nur dort, wo sie etwas mitteilt — und alles unter
  `prefers-reduced-motion` neutralisieren.

### Don't:
- **Don't** eine Pixelgrösse von Hand schreiben oder einen Abstand ausserhalb
  des Rasters.
- **Don't** eine Kiste um etwas bauen, das kein Objekt ist.
- **Don't** einen *farbigen* Streifen an die Kante einer Karte setzen; eine
  Haarlinie auf einer Seite ist das Gegenteil davon und ist Hausstil.
- **Don't** ein Symbol in ein abgerundetes Quadrat über eine Überschrift
  stapeln.
- **Don't** eine versale Beschriftung setzen, die den Reiter direkt darüber
  wiederholt.
- **Don't** einen pulsierenden Punkt auf eine Angabe setzen, die sich nie
  ändert.
- **Don't** Inter, Roboto oder system-ui als Fliesstextschrift einsetzen — und
  auch keine „sichere Alternative" wie Geist, Space Grotesk oder Poppins ohne
  echten Grund.
- **Don't** den Dunkelmodus aus dem hellen invertieren.
