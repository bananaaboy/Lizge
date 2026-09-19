# Sondra — Produktvermerk

Was eine spätere Sitzung wissen muss und weder dem Code noch der Git-Historie
ansieht. Kurz halten: mehr Text ist nicht automatisch mehr Kontext. Veraltete
Angaben hier sind schlimmer als fehlende — wenn sich etwas ändert, ändern.

Die gestalterischen Entscheidungen stehen **nicht** hier, sondern in
[CLAUDE.md](CLAUDE.md). Eine massgebliche Regeldatei, sonst driften zwei
auseinander und ziehen künftige Arbeit in verschiedene Richtungen.

## Publikum

Musikerinnen und Musiker, und daneben jede und jeder mit einer Datei und einer
Aufgabe. Deutschsprachig. Fachvokabular wird **nicht** vorausgesetzt: „Spuren",
„Lautheit" und „Harmonie" sind die Wörter derer, die schon wissen, worum es
geht — die Oberfläche benennt deshalb das Ergebnis, nicht die Technik.

## Hauptaufgabe

Eine Ton-, Video- oder Bilddatei hereinholen, damit etwas tun, das Ergebnis
mitnehmen. Fast alles hier ist **Operate**: man kommt mit einem Vorhaben, nicht
zum Stöbern.

Was es nicht ist: keine DAW, kein Mehrspur-Schnitt, kein Projektformat. Eine
Sitzung ist ein Tab, und das Schliessen des Tabs ist die Löschtaste.

## Einschränkungen

Diese sind gesetzt, nicht verhandelbar, und mehrere davon sind ausdrücklich so
gewünscht worden:

- **Es wird nichts hochgeladen.** Gerechnet wird im Tab. Kein Upload-Endpunkt,
  keine Datenbank, nichts überdauert das Schliessen.
- **Die eine Ausnahme heisst „Herunterladen"** und wird benannt, *bevor* jemand
  etwas eintippt — samt Proxy- und Haftungshinweis. Ein Werkzeug, das Lokalität
  behauptet und still eine Netzanfrage macht, ist schlimmer als eines, das es
  nie behauptet hat.
- **Nur rechtlich zulässige Downloads. Keine DRM-Umgehung.**
- **Keine fremde Instanz fest verdrahtet.** Ein Anbieter wird über
  `SONDRA_PROVIDER_URL` hinterlegt oder gar nicht. Sonst gingen alle
  eingegebenen Adressen an Dritte, die sich niemand ausgesucht hat.
- **Kein kompletter Rewrite.** Schrittweise erweitern, keine vorhandene
  Funktion ohne guten Grund entfernen, Breaking Changes vermeiden.
- Oberflächentexte **Deutsch**, Codekommentare **Englisch**.

## Gemessene Grenzen, die Versprechen begrenzen

Nicht vermutet, sondern nachgemessen (September 2026). Wer hier etwas anderes
verspricht, verspricht etwas Falsches:

| | |
|---|---|
| YouTube an einen Server | nur die progressive Spur, in der Regel 360p; manche Videos gar nichts |
| höhere Auflösungen | laufen über SABR und haben **keine** abrufbare Adresse — auch mit gültigem PoToken nicht |
| yt-dlp aus einem Rechenzentrum | löst auf, scheitert aber beim Holen an „Sign in to confirm you're not a bot" |
| voller Umfang | nur über einen hinterlegten Anbieter oder yt-dlp auf dem eigenen Gerät |

Deshalb steht im Downloader, **welcher Weg geantwortet hat**: das entscheidet
über die Auflösung und darüber, wer die Adresse gesehen hat.

## Betrieb

Bereitgestellt auf Vercel unter `www.lizge.ch`. Umgebungsvariablen und die
Entwicklungsbefehle stehen am Ende von [CLAUDE.md](CLAUDE.md).
