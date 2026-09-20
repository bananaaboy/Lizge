---
name: Sondra
description: Ein Medienstudio, das im Tab rechnet — und seine Oberfläche ist der Eichschein, den es ausstellt.
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
  rule: "#bbc6ba"
  faint: "#b0b6af"
  stage: "#15181a"
  stage-soft: "#1d2124"
  stage-line: "#515a5d"
  stage-ink: "#eef1f0"
  stage-muted: "#aab5b2"
typography:
  display:
    fontFamily: "'Public Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "39px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.5px"
  headline:
    fontFamily: "'Public Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "25px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "'Public Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.005em"
  body:
    fontFamily: "'Public Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  small:
    fontFamily: "'Public Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Public Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
  value:
    fontFamily: "'Courier Prime', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
  clause:
    fontFamily: "'Courier Prime', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    fontFeature: "tabular-nums"
  wordmark:
    fontFamily: "'Sondra Wordmark', ui-serif, Georgia, serif"
    fontSize: "25px"
    fontWeight: 300
    letterSpacing: "-0.01em"
rounded:
  card: "0px"
  nav: "0px"
  pill: "999px"
spacing:
  "0.5": "2px"
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "9": "36px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.body}"
    padding: "12px 16px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
    textColor: "{colors.on-ink}"
  button-quiet:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "12px 16px"
  button-quiet-hover:
    backgroundColor: "{colors.panel-soft}"
    textColor: "{colors.ink}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  button-sm:
    typography: "{typography.small}"
    padding: "8px 12px"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.prose}"
    typography: "{typography.value}"
    rounded: "{rounded.card}"
    padding: "8px 12px"
  select:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.prose}"
    typography: "{typography.small}"
    rounded: "{rounded.card}"
    padding: "8px 12px"
  chip:
    backgroundColor: "{colors.panel-soft}"
    textColor: "{colors.prose}"
    typography: "{typography.small}"
    rounded: "{rounded.nav}"
    padding: "8px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.prose}"
    typography: "{typography.small}"
    rounded: "{rounded.nav}"
    padding: "8px 12px"
  tab-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
  badge:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "3px 8px"
  badge-forest:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
  stat-row:
    backgroundColor: "transparent"
    textColor: "{colors.prose}"
    typography: "{typography.small}"
    padding: "8px 0"
  procedure-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.small}"
    padding: "10px 4px"
  procedure-row-hover:
    backgroundColor: "{colors.panel-soft}"
    textColor: "{colors.ink}"
  entry-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "16px 4px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.nav}"
    height: "32px"
    width: "32px"
  toggle-track:
    backgroundColor: "transparent"
    height: "16px"
    width: "28px"
  toggle-track-checked:
    backgroundColor: "{colors.ink}"
  toggle-knob:
    backgroundColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "12px"
    width: "12px"
  editor-frame:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.prose}"
    rounded: "{rounded.card}"
  editor-stage:
    backgroundColor: "{colors.stage}"
    textColor: "{colors.stage-ink}"
---

# Design System: Sondra

> Überschriften englisch, weil Werkzeuge sie genau so parsen; Inhalt deutsch wie
> in [PRODUCT.md](PRODUCT.md) und [CLAUDE.md](CLAUDE.md). Die **Tokens im
> Frontmatter sind normativ** — die Prosa sagt, wo und warum sie gelten, und
> wiederholt keinen Wert. Die Werte oben sind das helle Thema; die dunkle
> Umrechnung liegt Token für Token in `.impeccable/design.json`.
>
> Aufgenommen aus dem gebauten Stand, nicht aus dem Vorhaben. Quellen:
> `src/styles/theme.css`, `src/components/ui/primitives.tsx`, `public/fonts.css`
> und die drei Flächen, auf denen die Welt angewandt ist — `Home.tsx`,
> `AppShell.tsx`, `editor/EditorShell.tsx`.

## Overview

**Creative North Star: „Der Eichschein"**

Sondra misst, und die Oberfläche ist das Protokoll, das dabei herauskommt. Ein
Schweizer Prüfprotokoll nennt zuerst das Gerät, dann das Verfahren, dann das
Datum, und erst danach einen einzigen Wert — und genau in dieser Reihenfolge
beginnt hier jede Seite. Das ist keine Anmutung, sondern die eine Behauptung
des Produkts in sichtbarer Form: jede Zahl in dieser App wurde gemessen statt
geschätzt, und sie wurde auf dem Gerät der Besucherin gemessen.

Daraus folgt alles Weitere, und zwar als Verzicht. Es gibt keine Karten: ein
Formular hat keine Kästen, es hat Linien. Es gibt keine runden Ecken, weil eine
gerasterte Seite keine hat. Es gibt keinen Schatten auf dem Blatt, weil nichts
auf dem Blatt liegt — die eine Tiefenstufe ist für die drei Dinge reserviert,
die wirklich darüber schweben. Getrennt wird durch eine gezogene Linie und
durch Raum, nie durch einen Rahmen auf vier Seiten.

Zwei Schriften teilen sich die Arbeit nach Bedeutung, nicht nach Geschmack.
Public Sans ist das gedruckte Formular. Courier Prime ist das, was die Maschine
nachträglich eingetragen hat: Messwerte, Dateinamen, Zeitmarken. Wer die beiden
unterscheiden kann, sieht auf einen Blick, was das Formular fragt und was
gefunden wurde. Die Serife der vorigen Welt ist aus dem System verschwunden und
überlebt allein in der Wortmarke, als eigene Familie `Sondra Wordmark` — eine
gegebene Zusage ist etwas anderes als eine Gewohnheit.

Ausdrücklich verworfen: die Kategorie-Voreinstellung (dunkles Chrom, Neonakzent,
Wellenform als Held) und deren erwartbares Gegenteil, die luftige weisse Seite
mit grosser Serifen-Schlagzeile — das war diese App vor dem Umbau.

**Key Characteristics:**

- Jede Fläche nennt, was gemessen wurde, womit und nach welchem Verfahren
- Keine Karten, keine runden Ecken, kein Schatten auf dem Blatt
- Zwei Linienstärken statt Rahmen: die Haarlinie einer Tabelle, die schwerere Linie einer Klausel
- Zwei Schriften, getrennt nach Bedeutung: gedrucktes Formular und eingetragener Wert
- Klauselnummern sind Adressen — jede ist ein Anker und lässt sich zitieren
- Zustand steht als Zeichen am Rand, nicht als Satz
- Ein einziger gesättigter Farbwert, gemessene Kontraste in beiden Themen

## Colors

Warmes Papier trägt die Fläche, ein einziges dunkles Waldgrün ist die
Druckfarbe, und eine dritte Welt — die neutrale Bühne der Editoren —
widerspricht beiden mit Absicht.

### Primary

- **Waldtinte** (`{colors.ink}`): die einzige gesättigte Farbe im System und
  die einzige Druckfarbe. Sie liegt auf Klauselnummern, auf den Linien, auf
  Überschriften, auf dem Fokusring und auf der einen gefüllten Aktion je
  Abschnitt. Sie bedeutet genau eines: *hier können Sie etwas tun.*
- **Waldtinte gedrückt** (`{colors.ink-hover}`): ausschliesslich der
  Hover-Zustand gefüllter Flächen. Nirgends im Ruhezustand.
- **Papier auf Tinte** (`{colors.on-ink}`): Text auf gefüllter Tinte.

### Neutral

- **Warmes Papier** (`{colors.canvas}`): das Blatt selbst, Grund der ganzen App.
- **Feld** (`{colors.raised}`): Weiss erscheint nur, wo ein Feld ausfüllbar ist
  oder wo eine Fläche eine eigene Mechanik hat — Eingaben, der Editorrahmen,
  die Reiterleiste. Nicht als Karte; eine Karte gibt es hier nicht.
- **Blasse Minze** (`{colors.panel-soft}`): eingesetzte Blöcke und der
  Hover-Grund von Listenzeilen.
- **Minze** (`{colors.panel-mid}`) und **Kräftige Minze**
  (`{colors.panel-strong}`): die zweite Tönungsstufe und die Textmarkierung.
- **Kühle Minze** (`{colors.panel-cool}`): reserviert für den einen Hinweis,
  dass etwas nicht lokal läuft. Der einzige kühle Ton im hellen Thema, damit er
  sich nicht in die Reihe der übrigen Tönungen einsortiert.
- **Prosa** (`{colors.prose}`): Fliesstext und Beschriftungen.
- **Gedämpft** (`{colors.muted}`): Sekundärtext, Hinweise, Einheiten.
- **Nicht zutreffend** (`{colors.faint}`): ein Verfahren, das auf die geöffnete
  Datei nicht passt. Blasser als gedämpft, aber ausdrücklich noch lesbar — das
  Abdunkeln der ganzen Zeile mass sich bei APCA Lc 48 gegen ein Ziel von Lc 60
  und wurde dafür verworfen.
- **Haarlinie** (`{colors.line}`): die Linie einer Tabelle. Jede Trennung
  zwischen Zeilen, Feldern und Blöcken.
- **Klausellinie** (`{colors.rule}`): die schwerere Linie, die einen Abschnitt
  eröffnet, und der Ring um ein ruhiges Bedienelement.

### Tertiary

- **Bühne** (`{colors.stage}`), mit `{colors.stage-soft}`,
  `{colors.stage-line}`, `{colors.stage-ink}`, `{colors.stage-muted}`: die
  Fläche, auf der ein Bild oder Video bearbeitet wird. In beiden Themen dunkel
  und absichtlich neutral — ein Bild vor Creme wirkt warm, vor Grün kühl, und
  die eine Fläche, die über Farben nicht lügen darf, ist die, auf der man sie
  beurteilt.

### Named Rules

**Die Tinte-wird-ausgegeben-Regel.** Tinte liegt auf Linien, Klauselnummern und
der einen Aktion, um die ein Abschnitt bittet. Überall sonst ist die Seite
Papier und Graphit. Deckt sie mehr als etwa ein Zehntel eines Bildschirms, ist
sie keine Tinte mehr, sondern Farbe.

**Die Messregel.** Kontrast wird gerechnet, nicht geschätzt, und in beiden
Themen. APCA: Fliesstext ≥ Lc 75, Sekundärtext ≥ Lc 60, Überschriften ≥ Lc 45,
Nicht-Text ≥ Lc 15. Eine Palettenänderung ist erst fertig, wenn sie durch die
Zahlen gelaufen ist — dieser Durchgang fand eine Trennlinie bei Lc 0.0 und eine
gefüllte Schaltfläche bei Lc 70.

**Die Umrechnungsregel.** Dunkel ist eine eigene Abbildung mit eigenem
Kontrastdurchgang, nie eine Invertierung. Tinte und ihr Grund tauschen dort die
Rollen: der einzige gesättigte Wert muss der helle sein, sonst verschwinden
Überschriften und gefüllte Schaltflächen.

**Die Ehrliche-Bühne-Regel.** Die Bühne der Editoren bleibt neutral dunkel und
nimmt an keinem Themenwechsel teil. Sie ist kein Gestaltungsspielraum.

## Typography

**Form Font:** Public Sans (variabel 400–700), mit `ui-sans-serif`,
`system-ui`, `-apple-system`, `Segoe UI`
**Value Font:** Courier Prime (400 und 700), mit `ui-monospace`, `SF Mono`,
Menlo
**Wordmark Font:** `Sondra Wordmark` — Cormorant Garamond, ausschliesslich für
das eine Wort

**Character:** Public Sans existiert, weil eine Verwaltung eine Schrift
brauchte, in der ihre Dokumente gesetzt werden können — eine Amtsschrift der
Herkunft nach, nicht der Assoziation nach, mit den Tabellenziffern, die eine
Seite voller dB, LUFS und Byte-Zahlen braucht. Courier Prime ist die
Schreibmaschine, die auf echten Prüfscheinen die Lücken gefüllt hat. Beide sind
selbst gehostet unter `public/fonts`, kein CDN; nach dem Laden bleibt das Netz
still.

### Hierarchy

- **Display** (`display-lg`): die eine grosse Zeile einer Fläche. Steht in
  Tinte.
- **Headline** (`display-md`): der Kopf einer Hauptklausel — „Prüfgegenstand",
  „Verfügbare Verfahren". Steht in Tinte, neben seiner Klauselnummer.
- **Title** (`display-sm`): Dialogtitel und Zwischenüberschriften.
- **Body**: laufender Text und die grosse Schaltflächengrösse. 16 px, weil das
  hier Deutsch ist — lange Wörter, und 14 px verlangt ihnen zu viel ab.
- **Small**: das dichte Werkzeug-Chrome — Anzeigen, Hinweise, Chips, Reiter,
  Formularzeilen. Drei Grössen tragen die ganze Oberfläche, und das ist die
  mittlere davon.
- **Label**: 11 px. Die kleinste Stufe: Kopfzeilen-Angaben, Beschriftungen in
  der Werkzeugleiste des Editors, und als einzige Versalbehandlung der
  gestempelte Badge (Laufweite 0.08em).
- **Value** (`value`): was die Maschine gefunden hat. Rechtsbündig, mit
  Tabellenziffern, in eigener Spalte neben der Einheit. Erscheint in der
  Grösse der Zeile, in der es steht — meist Small oder Label.
- **Clause** (`clause`): die Adresse einer Klausel, im linken Rand ausserhalb
  der Textspalte, in Tinte.
- **Wordmark**: das Wort „Sondra" im Kopf, in Gewicht 300. Sonst nirgends.

### Named Rules

**Die Zwei-Schriften-Regel.** Courier Prime steht für etwas, das tatsächlich
gefunden wurde: ein Messwert, ein Dateiname, eine Zeitmarke, eine
Klauselnummer. Nie als Kostüm für „technisch". Was das Formular fragt, steht in
Public Sans.

**Die Sechs-Stufen-Regel.** Eine grosse Terz ab 16 px, genau sechs Stufen,
nichts dazwischen. Die Vorgängerwelt erklärte fünf Stufen und schrieb daneben
220 Grössen von Hand, darunter 9, 10, 10.5, 11, 12, 13, 13.5 und 14 px für
dieselbe Aufgabe. Zwei Grössen einen Pixel auseinander sind keine Hierarchie,
sondern eine nicht getroffene Entscheidung.

**Die Kein-Anzeigeschnitt-Regel.** Überschriften sind dieselbe Grotesk, nur
grösser und schwerer. Ein Prüfschein hat keine Anzeigeschrift, und die, die
diese App hatte, steht auf jeder Liste von Schriften, nach denen ein Modell
greift, ohne hinzusehen.

**Die Ein-Wort-Regel.** Cormorant Garamond lädt als eigene Familie
`Sondra Wordmark` und setzt genau ein Wort. Sie ist nirgendwo sonst erlaubt —
auch nicht dort, wo eine Überschrift sie „auch" verwenden könnte.

## Layout

Die Seite ist ein Blatt. `shell` zentriert sie auf höchstens 1280 px und hält
links und rechts einen Rand von 21 px.

Alles komponiert als gerasterte zweispaltige Tabelle: Beschriftung links, Wert
rechtsbündig, Einheit in eigener schmaler Spalte (`w-[4ch]` bis `w-[6ch]`), so
dass eine Spalte von Werten von oben nach unten gelesen werden kann.
Klauselnummern sitzen in einer eigenen Randspalte (`w-[4ch]`/`w-[5ch]`)
ausserhalb der Textspalte und bilden eine durchgehende senkrechte Achse über
die ganze Seite. Daneben steht, wo eine Zeile einen Zustand hat, das Randzeichen
in derselben Achse.

Fliesstext, Listeneinträge und Beschreibungen sind auf **34em** gedeckelt.
Werte, Beschriftungen und Tabellenzellen erreichen die Deckelung nie, weil sie
kurz sind.

Abstände folgen einem 4-px-Raster; 2 px existiert als Halbschritt für
Haarlinien-Versätze. Tatsächlich getragen wird das System von vier Werten —
4, 8, 12 und 16 px — mit 20, 24, 32, 36 und 48 px für die grossen Sprünge.
Um das, was mehr zählt, steht mehr Raum: eine Verfahrenszeile bekommt 10 px
Höhe, eine Eingangszeile 16 px.

Die Umbrüche sind zwei. Unter **640 px** stapeln Formularzeilen Beschriftung
über Feld, und Raster fallen auf eine Spalte. Unter **1024 px** verliert der
Editor seine drei Spalten: die Werkzeugschiene wird zum waagerechten Streifen
unter der Bühne, der Inspektor fällt darunter. Die Reihenfolge bleibt dieselbe —
sehen, Werkzeug wählen, einstellen.

### Named Rules

**Die Adressregel.** Eine Klauselnummer wird nur gesetzt, wenn sie eine Adresse
ist: sie rendert als Verweis auf den eigenen Anker, ist aus der Adresszeile
kopierbar und führt beim Einfügen wieder dorthin. Eine Nummer, die nur
schmückt, ist verboten. Die Nummern stammen aus einer festen Liste, nicht aus
der Reihenfolge einer gefilterten Darstellung — eine Nummer, die sich beim
Tippen verschiebt, ist keine Adresse.

**Die 34em-Regel.** Die Textspalte wird nicht breiter, weil das Fenster es
wurde. Die Einheit ist `em` und nicht `ch`: ein `ch` ist die Breite der Null und
damit breiter als der Durchschnittsbuchstabe, weshalb eine Deckelung bei 68ch
in Wahrheit bei 90 Zeichen landete.

## Elevation & Depth

Es gibt **genau eine Tiefenstufe**, und sie ist im Ruhezustand nirgends auf dem
Blatt. Das Blatt ist der Grund; nichts liegt darauf, also wirft nichts einen
Schatten darauf. Getrennt wird durch Linie, Raum und — für eingesetzte Blöcke —
durch eine Tönung, nie durch Abheben. Die zweite Stufe der Vorgängerwelt ist
mit den Karten verschwunden, die sie anhob.

### Shadow Vocabulary

- **Lift** (`--shadow-lift`, Utility `elevate-lift`): das Einzige, was schwebt.
  Im gebauten Stand trägt es drei Dinge: das Popover mit dem Lokalitäts-
  Versprechen, die Ablage-Überlagerung beim Ziehen einer Datei, und das Bild
  beziehungsweise Video, das auf der Bühne gezeigt wird. Im dunklen Thema ist
  es eine eigene, deutlich tiefere Umrechnung, keine Anpassung des hellen.

### Named Rules

**Die Nichts-liegt-auf-dem-Blatt-Regel.** Bevor etwas einen Schatten bekommt,
muss beantwortet sein, worüber es schwebt. Lässt sich das nicht beantworten,
schwebt es nicht: dann trennen Linie und Raum.

**Die Getönt-statt-gehoben-Regel.** Ein Block, der in einem Abschnitt sitzt,
bekommt eine Tönung, damit das Auge ihn als eingesetzt liest — nicht einen
Schatten, der ihn als weiteres gestapeltes Objekt behauptet.

## Shapes

**Ecken sind eckig.** Die Radius-Tokens `card` und `nav` stehen beide auf 0;
ein gerastertes Formular hat keine runden Ecken, auch nicht kleine. Erhalten
bleibt `pill` (999 px) für die eine Sache, die ein physisches Objekt ist: den
Knauf des Schalters. Daneben stehen zwei bewusste Ausnahmen ausserhalb des
Formulars — die auf der Bühne gezeigte Rasterdatei und die Balken der
Harmonie-Darstellung tragen 2–3 px, weil sie gezeichnete Objekte sind und keine
Teile des Formulars.

**Struktur wird gezogen, nicht angedeutet.** Zwei Linienstärken, und der
Unterschied ist nicht Dekoration:

- Die **Haarlinie** (`border-t border-line`, 1 px) ist die Linie einer Tabelle.
  Sie steht zwischen Zeilen, über einem Feld, über einem aufklappbaren
  Unterpunkt.
- Die **Klausellinie** (`border-t-2 border-rule`, 2 px) eröffnet einen
  Abschnitt und schliesst die Kopfzeile nach unten ab.

Eine Linie steht immer **auf einer Seite** — auf der, die dem zugewandt ist,
wovon getrennt wird. Eine Regel über dem ersten Eintrag ist zugleich die
Oberkante der Gruppe, also braucht die Gruppe keinen Kasten. Wo ein Umriss
wirklich gebraucht wird, weil eine Fläche eine eigene Mechanik hat — das
Eingabefeld, der Editorrahmen, die Reiterleiste —, ist es ein
`ring-1 ring-inset` in Haarlinien- oder Klausellinienstärke, kein `border`
und kein Schatten.

**Symbole**: der projekteigene Strichsatz, 16 px in `components/panelMeta.tsx`,
18–20 px in `components/editor/icons.tsx`, Strichstärke 1.35–1.4, ein Raster.
Nur dort, wo das Symbol eine Information trägt. Keine Symbolbibliotheken, keine
Emoji.

### Named Rules

**Die Eine-Linie-Regel.** Ein Rahmen auf allen vier Seiten behauptet, das hier
sei ein Objekt auf einer Fläche. In dieser Welt stimmt das für fast nichts. Die
Reihenfolge, in der gegriffen wird: erst Raum, dann Tönung, dann eine Linie,
und erst ganz zuletzt ein Umriss — und der nur für eine Fläche mit eigener
Mechanik.

**Die Zwei-Stärken-Regel.** Es gibt genau zwei Linien: die Haarlinie der
Tabelle und die schwerere Linie der Klausel. Beide sind eigene Farbtokens und
keine Deckkraft auf Tinte — dieselbe Tinte bei 25 % mass sich auf Papier bei
APCA Lc 25 und im dunklen Thema bei Lc 7.

## Components

### Buttons

- **Shape:** eckig, ohne Radius, ohne Schatten.
- **Primary:** gefüllte Tinte. Die eine Aktion, um die ein Abschnitt bittet —
  ein Formular hat eine Stelle, an der unterschrieben wird. Sie steht am Fuss
  ihrer Klausel, rechts an der Wertspalte ausgerichtet.
- **Quiet:** Feldweiss mit Klausellinien-Ring. Eine gerasterte Fläche, die man
  auch drücken kann.
- **Ghost:** ein Wort im laufenden Text, unterstrichen in Klausellinie; beim
  Zeigen wechselt die Unterstreichung auf Tinte.
- **Hover / Active / Focus:** Farbwechsel in `--dur-fast`; ein Versatz von 1 px
  nach unten, nur bei feinem Zeiger (`press`). Fokus ist ein 2-px-Ring in Tinte
  mit 2 px Versatz, nie Browserblau.
- **Disabled:** Deckkraft 0.4, `cursor: not-allowed`.

### Chips

- **Style:** blasse Minze mit Haarlinien-Ring, Small, eckig. „Eins aus vier" —
  Seitenverhältnisse, Drehungen, Formate.
- **State:** ausgewählt ist gefüllte Tinte ohne Ring; `aria-pressed` trägt den
  Zustand mit.

### Containers

Es gibt **keine Karte**. `Card` ist der Name der Komponente, nicht ihrer Form:

- **`cream` / `keylime`** sind Abschnitte des Blattes — eine Klausellinie über
  die volle Breite, darunter Luft, darunter der Inhalt. Kein Grund, kein
  Rahmen, kein Schatten.
- **`mint` / `sage` / `slate`** sind Blöcke, die *in* einen Abschnitt gesetzt
  sind. Sie bekommen eine Tönung (`panel-soft`, `panel-mid`, `panel-cool`) und
  16 px Innenraum (12 px in `compact`), damit das Auge sie als eingesetzt liest.

### Inputs

- **Style:** Feldweiss, eckig, Haarlinien-Ring nach innen, `border: 0`, Small,
  8/12 px Innenraum. `TextInput` trägt zusätzlich `value` — was eingetippt
  wird, steht in der Schrift der eingetragenen Dinge.
- **Focus:** der Ring wechselt auf Tinte; das Feld verschiebt sich nicht.
- **Field:** eine Zeile des Formulars — Haarlinie oben, Beschriftung, Feld,
  darunter der Hinweis in gedämpft. Unter 640 px stapeln Beschriftung und Feld,
  weil eine deutsche Beschriftung und ein Bedienelement nebeneinander in
  340 px für keines von beiden Platz lassen.
- **Slider:** die Spur ist eine gedruckte Linie von 1 px, der Griff ein
  rechteckiger Reiter von 3 × 14 px in Tinte — keine OS-Chrome. Der Wert steht
  rechts in der Wertschrift.
- **Toggle:** eckiger Körper von 28 × 16 px, runder Knauf von 12 px. Der
  Schalter ist der eine physische Gegenstand auf einem Blatt Papier und deshalb
  das eine, was eine Rundung haben darf.

### Navigation

- **Reiterleiste** (`PanelTabs`): eine waagerechte Liste auf Feldweiss mit
  Haarlinien-Ring, jeder Reiter mit seiner Nummer in der Klauselschrift davor.
  Ausgewählt ist gefüllte Tinte; die Nummer wechselt dann auf `on-ink/70`.
  Pfeiltasten wechseln den Reiter, der gewählte bleibt der einzige mit
  `tabIndex 0`, und die Ränder blenden nur dort aus, wo wirklich noch etwas
  hinter ihnen liegt.
- **Werkzeugschiene** (`Rail`): senkrecht 84 px breit auf Feldweiss, Symbol
  über Beschriftung in Label-Grösse; ein Werkzeug mit geänderter Einstellung
  trägt ein 5-px-Quadrat oben rechts. Unter 1024 px waagerecht.
- **Kopfzeile:** klebt oben, Klausellinie nach unten, Grund `canvas/95` mit
  Unschärfe. Links die Wortmarke, darunter drei Schlüssel/Wert-Zeilen —
  Gerät, Verfahren, Stand. Ein Prüfschein nennt das Instrument, bevor er einen
  Wert nennt, und welcher Browser mit wie vielen Kernen rechnet, entscheidet
  hier tatsächlich, was die Werte darunter wert sind.

### Signature Components

**Das Randzeichen (`Mark`).** Der Zustand eines Wertes als ein Zeichen in der
Randspalte: `—` noch nicht gemessen, `●` gemessen, `!` ausserhalb der Toleranz.
Es ist vor jedem Wort lesbar, und es trägt seinen Klartext in `aria-label` und
`title` mit. Ein Satz, der dasselbe sagt, müsste erst gelesen werden.

**Die Messzeile (`Stat`).** Was gemessen wurde links, was herauskam rechts, die
Einheit in eigener Spalte, Haarlinie oben. Der Wert steht in der Wertschrift und
spielt beim Erscheinen einmal `pop` — eine Zahl, die gerade errechnet wurde,
darf einmal auffallen.

**Der Klauselkopf (`ClauseHead`).** Benennt einen Bereich, den die Leserin sonst
nicht benennen könnte — „Zielwerte", „Ergebnis", „Nächstbeste". Er *ist* die
Überschrift, keine Zeile darüber. Kein Kasten, keine Versalien; die Linie
darüber trennt.

**Der Vermerk (`Notice`).** Eine Anmerkung zum Befund: Klausellinie oben,
Randzeichen, Text. Kein farbiges Feld ringsum — ein Prüfschein annotiert, er
umrandet die Annotation nicht.

**Die Unterklausel (`Reveal`).** Der genaue FFmpeg-Aufruf, das Analysefenster,
die zweitbeste Tonart. Haarlinie oben, `+` / `−` in der Wertschrift. Sichtbar
kostet es alle anderen für die Lebensdauer der App; gefaltet kostet es einen
Klick, einmal.

**Die Verfahrenszeile (`Tool`).** Eine Zeile des nummerierten Index, Haarlinie
oben, Symbol auf der Beschriftungszeile, Hinweis darunter. Passt ein Verfahren
nicht zur geöffneten Datei, sagt das allein die Symbolfarbe (`faint`) — und
auch das erst, wenn überhaupt etwas geöffnet ist. Ersetzt hat sie ein
gleichmässiges Raster identisch grosser Kacheln mit je einem Symbol im
abgerundeten Quadrat über der Überschrift.

**Der Editorrahmen (`EditorShell`).** Feldweiss mit Haarlinien-Ring: Kopfzeile
mit Dateiname und den Aktionen auf das ganze Dokument, dann Schiene · Bühne ·
Inspektor, darunter eine Statuszeile. Die Bühne bewegt sich nie und scrollt
nie; ein Werkzeugwechsel tauscht nur die Spalte rechts und spielt dort `rise`.
Der Schachbrettgrund (`stage-checks`) ist die eine Stelle, an der ein
dekoratives Muster seinen Platz verdient — er ist die einzige Art, „dieses
Pixel ist durchsichtig" von „dieses Pixel ist grau" zu unterscheiden.

### Motion

Vier Bewegungen, und keine fünfte wird erfunden. `rise` (etwas ist angekommen),
`pop` (eine Zahl wurde gerade errechnet), `press` (ein Bedienelement antwortet
dem Zeiger), `pulse-dot` (etwas läuft wirklich gerade). Dazu `sondra-drift` für
den unbestimmten Balken, wenn der Server keine Länge meldet. Drei Dauern
(`--dur-fast` 130 ms, `--dur-base` 240 ms, `--dur-slow` 420 ms) und zwei
Kurven (`--ease-out`, `--ease-settle`); alles nur Transform und Deckkraft, und
`prefers-reduced-motion` neutralisiert es vollständig.

## Do's and Don'ts

### Do:

- **Do** die Tinte für genau eine Bedeutung ausgeben: *hier können Sie etwas
  tun.* Höchstens ein Zehntel eines Bildschirms.
- **Do** mit Raum trennen, dann mit einer Tönung, dann mit einer Linie auf
  einer Seite — und einen Umriss nur für eine Fläche mit eigener Mechanik.
- **Do** jede Grösse aus den sechs Typo-Tokens nehmen und jeden Abstand aus dem
  4-px-Raster.
- **Do** Courier Prime nur dort setzen, wo die Maschine etwas eingetragen hat:
  Messwert, Dateiname, Zeitmarke, Klauselnummer.
- **Do** jeder Klauselnummer einen Anker geben, auf den sie selbst verweist,
  und sie aus einer festen Liste nehmen statt aus der gerade sichtbaren
  Reihenfolge.
- **Do** Zustand als Zeichen in die Randspalte setzen und den Klartext über
  `aria-label` und `title` mitliefern.
- **Do** Kontraste in beiden Themen rechnen, bevor eine Palettenänderung als
  fertig gilt.
- **Do** jeden Zustand entwerfen: Fehler, leer, lädt, Fokus, deaktiviert.

### Don't:

- **Don't** eine Karte bauen. Kein weisser Kasten mit Rahmen ringsum und
  Schatten darunter — Weiss markiert ein Feld oder eine Fläche mit eigener
  Mechanik, nicht ein Objekt auf dem Papier.
- **Don't** eine Ecke runden. `card` und `nav` stehen auf 0, und das ist keine
  Übergangslösung; `pill` gehört dem Schalterknauf.
- **Don't** einem Element auf dem Blatt einen Schatten geben. `elevate-lift`
  gehört dem, was wirklich darüber schwebt.
- **Don't** eine Klauselnummer setzen, die nirgendwohin führt, oder eine, die
  sich beim Tippen in der Suche verschiebt.
- **Don't** Courier Prime als Kostüm für „technisch" verwenden — nicht für
  Überschriften, Beschriftungen oder Fliesstext.
- **Don't** Cormorant Garamond ausserhalb der Wortmarke einsetzen, und keinen
  Anzeigeschnitt einführen, den ein Prüfschein nicht hätte.
- **Don't** Inter, Roboto, system-ui oder eine „sichere Alternative" (Geist,
  Space Grotesk, Poppins) als Fliesstextschrift einsetzen.
- **Don't** eine Pixelgrösse von Hand schreiben, wo ein Typo-Token existiert,
  oder einen Abstand ausserhalb des Rasters.
- **Don't** den dunklen Modus aus dem hellen invertieren, und die Bühne
  überhaupt nicht umfärben.
- **Don't** ein Symbol in ein abgerundetes Quadrat über eine Überschrift
  stapeln, eine versale Beschriftung setzen, die den Reiter darüber wiederholt,
  oder einen pulsierenden Punkt auf eine Angabe legen, die sich nie ändert.
- **Don't** dreissig Verfahren als gleichmässiges Raster identischer Kacheln
  zeigen. Es ist eine Liste, und ein nummerierter Index ist ihre Form.
