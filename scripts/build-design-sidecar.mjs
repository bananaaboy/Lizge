/**
 * Writes `.impeccable/design.json` — the sidecar that carries what DESIGN.md's
 * frontmatter schema cannot hold: tonal ramps, shadow and motion tokens,
 * breakpoints, drop-in component snippets, and the narrative.
 *
 * The ramps are computed rather than invented. Each one holds the token's own
 * hue and chroma and walks only its lightness, in OKLab, because walking
 * lightness in sRGB turns a dark green into a grey-green on the way up — the
 * strip would then show a hue the project does not contain.
 */

import fs from 'node:fs'
import path from 'node:path'

/* -- sRGB <-> OKLab ------------------------------------------------------- */

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

function hexToOklab(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => toLinear(parseInt(hex.slice(1 + i, 3 + i), 16) / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

function oklabToHex({ L, a, b }) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return (
    '#' +
    rgb
      .map((c) => Math.max(0, Math.min(255, Math.round(toGamma(c) * 255))).toString(16).padStart(2, '0'))
      .join('')
  )
}

/** Eight steps, dark to light, hue and chroma held. */
function ramp(hex) {
  const { a, b } = hexToOklab(hex)
  return Array.from({ length: 8 }, (_, i) => oklabToHex({ L: 0.15 + (i * (0.95 - 0.15)) / 7, a, b }))
}

/* -- the record ------------------------------------------------------------ */

const colors = {
  ink: ['primary', 'Waldtinte', '#0f3e1c', 'Die einzige gesättigte Farbe. Alles, was anklickbar ist.'],
  'ink-hover': ['primary', 'Waldtinte gedrückt', '#0a2b13', 'Nur der Hover-Zustand gefüllter Flächen.'],
  canvas: ['neutral', 'Warmes Papier', '#f4f3ee', 'Die Seite selbst.'],
  raised: ['neutral', 'Karte', '#ffffff', 'Nur für Dinge, die auf dem Papier liegen.'],
  'panel-soft': ['neutral', 'Blasse Minze', '#eaf2e9', 'Getönte Blöcke innerhalb einer Karte.'],
  'panel-cool': ['neutral', 'Kühle Minze', '#e4edef', 'Reserviert für den Hinweis, dass etwas nicht lokal läuft.'],
  prose: ['neutral', 'Prosa', '#1b231d', 'Fliesstext.'],
  muted: ['neutral', 'Gedämpft', '#5d6c61', 'Sekundärtext.'],
  line: ['neutral', 'Linie', '#d5d4c9', 'Jede Trennung. Gemessen auf APCA Lc 15.'],
  stage: ['tertiary', 'Bühne', '#15181a', 'Die Editor-Fläche. Neutral, damit sie über Farben nicht lügt.'],
}

const design = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  title: 'Design System: Sondra',
  extensions: {
    colorMeta: Object.fromEntries(
      Object.entries(colors).map(([key, [role, displayName, canonical, purpose]]) => [
        key,
        { role, displayName, canonical, purpose, tonalRamp: ramp(canonical) },
      ]),
    ),
    typographyMeta: {
      display: { displayName: 'Display', purpose: 'Die eine grosse Zeile pro Bildschirm. Nur Gewicht 300.' },
      headline: { displayName: 'Headline', purpose: 'Abschnittsüberschriften in Karten.' },
      title: { displayName: 'Title', purpose: 'Zwischenüberschriften, Dateiname im Editorkopf.' },
      body: { displayName: 'Body', purpose: 'Fliesstext und primäre Bedienelemente. 16px, weil Deutsch lange Wörter hat.' },
      small: { displayName: 'Small', purpose: 'Die dichte Werkzeugleiste: Anzeigen, Hinweise, Chips, Reiter.' },
      label: { displayName: 'Label', purpose: 'Die einzige Grossbuchstaben-Behandlung im System.' },
    },
    shadows: [
      {
        name: 'card',
        value: '0 1px 2px rgb(20 35 25 / 0.04), 0 4px 16px -8px rgb(20 35 25 / 0.1)',
        purpose: 'Hebt eine Karte vom Papier ab. Der Ruhezustand.',
      },
      {
        name: 'lift',
        value: '0 2px 6px rgb(20 35 25 / 0.06), 0 12px 30px -12px rgb(20 35 25 / 0.18)',
        purpose: 'Antwort auf den Zeiger oder auf Ziehen. Nie im Ruhezustand.',
      },
    ],
    motion: [
      { name: 'ease-out', value: 'cubic-bezier(0.22, 0.72, 0.28, 1)', purpose: 'Standard für jeden Zustandswechsel.' },
      { name: 'ease-spring', value: 'cubic-bezier(0.34, 1.32, 0.5, 1)', purpose: 'Nur für etwas, das gerade entstanden ist.' },
      { name: 'dur-fast', value: '130ms', purpose: 'Farbwechsel, Druck, alles, was sofort antworten muss.' },
      { name: 'dur-base', value: '240ms', purpose: 'Eintritt neuer Inhalte.' },
      { name: 'dur-slow', value: '420ms', purpose: 'Die seltene grosse Bewegung.' },
    ],
    breakpoints: [
      { name: 'sm', value: '640px' },
      { name: 'lg', value: '1024px' },
      { name: 'shell-max', value: '1280px' },
    ],
  },
  components: [
    {
      name: 'Primary Button',
      kind: 'button',
      refersTo: 'button-primary',
      description: 'Die eine primäre Aktion eines Bereichs.',
      html: '<button class="ds-btn-primary">Datei speichern</button>',
      css: '.ds-btn-primary{background:#0f3e1c;color:#fff;font:400 16px/1.55 Archivo,system-ui,sans-serif;padding:12px 20px;border:none;border-radius:14px;box-shadow:0 1px 2px rgb(20 35 25/.04),0 4px 16px -8px rgb(20 35 25/.1);transition:background 130ms cubic-bezier(.22,.72,.28,1),transform 130ms cubic-bezier(.22,.72,.28,1);cursor:pointer}.ds-btn-primary:hover{background:#0a2b13}.ds-btn-primary:active{transform:translateY(1px)}.ds-btn-primary:focus-visible{outline:2px solid #0f3e1c;outline-offset:2px}.ds-btn-primary:disabled{opacity:.4;cursor:not-allowed}',
    },
    {
      name: 'Quiet Button',
      kind: 'button',
      refersTo: 'button-quiet',
      description: 'Die zweite Wahl, die sichtbar die zweite ist.',
      html: '<button class="ds-btn-quiet">In die Sitzung übernehmen</button>',
      css: '.ds-btn-quiet{background:#fff;color:#0f3e1c;font:400 16px/1.55 Archivo,system-ui,sans-serif;padding:12px 20px;border:none;border-radius:14px;box-shadow:inset 0 0 0 1px #d5d4c9;transition:background 130ms cubic-bezier(.22,.72,.28,1);cursor:pointer}.ds-btn-quiet:hover{background:#eaf2e9}.ds-btn-quiet:focus-visible{outline:2px solid #0f3e1c;outline-offset:2px}',
    },
    {
      name: 'Choice Chip',
      kind: 'chip',
      refersTo: 'chip',
      description: 'Eins aus vier: Seitenverhältnis, Format, Tempo. Ausgewählt ist gefüllt.',
      html: '<div style="display:flex;gap:5px"><button class="ds-chip" aria-pressed="false">Frei</button><button class="ds-chip ds-chip-on" aria-pressed="true">16:9</button></div>',
      css: '.ds-chip{background:#eaf2e9;color:#1b231d;font:400 13px/1.5 Archivo,system-ui,sans-serif;padding:8px 12px;border:none;border-radius:7px;box-shadow:inset 0 0 0 1px #d5d4c9;cursor:pointer;transition:background 130ms cubic-bezier(.22,.72,.28,1)}.ds-chip:hover{background:#e2ebe1}.ds-chip-on{background:#0f3e1c;color:#fff;box-shadow:none}.ds-chip:focus-visible{outline:2px solid #0f3e1c;outline-offset:2px}',
    },
    {
      name: 'Card',
      kind: 'card',
      refersTo: 'card',
      description: 'Weiss auf Papier. Das einzige, was vier Seiten Rahmen bekommt.',
      html: '<div class="ds-card"><p class="ds-card-eyebrow">Ergebnis</p><p class="ds-card-title">clip.mp4</p><p class="ds-card-meta">1.2 MB · 20 % der Quelle</p></div>',
      css: '.ds-card{background:#fff;border-radius:14px;padding:24px;box-shadow:inset 0 0 0 1px #d5d4c9,0 1px 2px rgb(20 35 25/.04),0 4px 16px -8px rgb(20 35 25/.1);font-family:Archivo,system-ui,sans-serif;max-width:320px}.ds-card-eyebrow{margin:0;font:600 11px/1.45 Archivo,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#0f3e1c}.ds-card-title{margin:4px 0 0;font:400 20px/1.35 Archivo,system-ui,sans-serif;color:#0f3e1c}.ds-card-meta{margin:2px 0 0;font:400 13px/1.5 Archivo,system-ui,sans-serif;font-variant-numeric:tabular-nums;color:#5d6c61}',
    },
    {
      name: 'Text Input',
      kind: 'input',
      refersTo: 'input',
      description: 'Fliesstextgrösse, damit iOS beim Fokussieren nicht hineinzoomt.',
      html: '<input class="ds-input" type="text" placeholder="https://www.youtube.com/watch?v=…" />',
      css: '.ds-input{width:100%;background:#fff;color:#1b231d;font:400 16px/1.55 Archivo,system-ui,sans-serif;padding:12px 16px;border:none;border-radius:7px;box-shadow:inset 0 0 0 1px #d5d4c9;outline:none}.ds-input::placeholder{color:#5d6c61}.ds-input:focus{box-shadow:inset 0 0 0 1px #0f3e1c}',
    },
    {
      name: 'Tool Row',
      kind: 'custom',
      refersTo: 'tool-row',
      description:
        'Die Signaturkomponente des Startbildschirms. Eine Linie oben statt eines Kastens ringsum; ein Symbol auf der Beschriftungszeile statt darüber.',
      html: '<div style="background:#f4f3ee;padding:0 0 1px"><button class="ds-tool"><span class="ds-tool-label"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.2h12v9.6H2zM2 10l3.4-3.2 3 2.8 2.2-2 3.4 3.2M5.6 6.2a.9.9 0 100-1.8.9.9 0 000 1.8z"/></svg>Bild zuschneiden</span><span class="ds-tool-hint">Ausschnitt aufziehen</span></button><button class="ds-tool"><span class="ds-tool-label"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M2.6 5.4h9.2m0 0L9.4 3.1m2.4 2.3L9.4 7.7M13.4 10.6H4.2m0 0l2.4-2.3m-2.4 2.3l2.4 2.3"/></svg>Bildformat ändern</span><span class="ds-tool-hint">PNG, JPEG oder WebP</span></button></div>',
      css: '.ds-tool{display:flex;flex-direction:column;align-items:flex-start;gap:4px;width:100%;background:transparent;border:none;border-top:1px solid #d5d4c9;padding:12px 16px;text-align:left;cursor:pointer;transition:background 130ms cubic-bezier(.22,.72,.28,1)}.ds-tool:hover{background:#eaf2e9}.ds-tool-label{display:flex;align-items:center;gap:8px;font:600 13px/1.3 Archivo,system-ui,sans-serif;color:#0f3e1c}.ds-tool-label svg{color:#5d6c61;transition:color 130ms cubic-bezier(.22,.72,.28,1)}.ds-tool:hover .ds-tool-label svg{color:#0f3e1c}.ds-tool-hint{font:400 13px/1.4 Archivo,system-ui,sans-serif;color:#5d6c61}.ds-tool:focus-visible{outline:2px solid #0f3e1c;outline-offset:-2px}',
    },
  ],
  narrative: {
    northStar: 'Schweizer Messinstrument auf warmem Papier',
    overview:
      'Sondra ist ein Werkzeug, kein Schaufenster. Man kommt mit einer Datei und einem Vorhaben, und jeder Bildschirm ist dafür da, dieses Vorhaben auszuführen. Das ist die ganze Begründung für die Dichte: 13px Bedienelemente, Tabellenziffern in jeder Anzeige, Regler direkt neben dem, worauf sie wirken.\n\nDas Papier ist die zweite Hälfte. Die Fläche ist kein kaltes Grau, sondern ein warmes Cremeweiss, auf dem weisse Karten wirklich liegen — und die einzige gesättigte Farbe im ganzen Aufbau ist ein dunkles Waldgrün, das ausschliesslich eines bedeutet: hier kannst du etwas tun.\n\nDie dritte Fläche widerspricht beiden mit Absicht: die Bühne der Editoren ist ein neutrales Dunkel. Die eine Fläche, deren Aufgabe es ist, über Farben nicht zu lügen, ist die, auf der man sie bearbeitet.',
    keyCharacteristics: [
      'Ein einziger Akzent, der eine einzige Bedeutung hat',
      'Dichte als Respekt vor jemandem, der arbeitet — nicht als Sparsamkeit',
      'Gemessene Kontraste statt Augenmass',
      'Eine Linie auf einer Seite, wo andere eine Kiste bauen',
      'Zwei Schriften mit klarer Arbeitsteilung, sechs Grössen, kein Zwischenschritt',
    ],
    rules: [
      {
        name: 'Die Ein-Stimme-Regel',
        body: 'Der Akzent liegt auf höchstens einem Zehntel eines Bildschirms. Liegt er auf jedem dritten Element, ist er kein Akzent mehr, sondern Dekoration.',
        section: 'colors',
      },
      {
        name: 'Die Messregel',
        body: 'Kontrast wird gerechnet, nicht geschätzt. APCA: Fliesstext ≥ Lc 75, Sekundärtext ≥ Lc 60, Überschriften ≥ Lc 45, Nicht-Text ≥ Lc 15.',
        section: 'colors',
      },
      {
        name: 'Die Dunkelmodus-Regel',
        body: 'Dunkel ist eine eigene Abbildung mit eigenem Kontrastdurchgang, nie eine Invertierung.',
        section: 'colors',
      },
      {
        name: 'Die Sechs-Stufen-Regel',
        body: 'Eine grosse Terz ab 16px, genau sechs Stufen, nichts dazwischen. Grössen, die einen Pixel auseinanderliegen, sind keine Hierarchie.',
        section: 'typography',
      },
      {
        name: 'Die Ergebnis-Regel',
        body: 'Beschriftungen benennen das Ergebnis, nicht die Technik. Wer mit einer Aufnahme und einer Frage ankommt, kennt das Fachwort noch nicht.',
        section: 'typography',
      },
      {
        name: 'Die Eine-Stufe-tief-Regel',
        body: 'Tiefe geht genau einen Schritt. Eine Karte liegt auf dem Papier; alles Getönte sitzt flach darin.',
        section: 'elevation',
      },
      {
        name: 'Die Eine-Linie-Regel',
        body: 'Ein Rahmen auf allen vier Seiten behauptet, das hier sei ein Objekt. Das stimmt für eine Karte und fast nichts sonst. Sonst: eine einzige Haarlinie auf der Seite, die dem zugewandt ist, wovon getrennt wird.',
        section: 'shapes',
      },
      {
        name: 'Die Mehr-für-Wichtiges-Regel',
        body: 'Ein System ist nicht dasselbe wie Gleichförmigkeit. Um das, was mehr zählt, steht mehr Raum.',
        section: 'layout',
      },
    ],
    dos: [
      'Do den Akzent für genau eine Bedeutung verwenden: hier kannst du etwas tun. Höchstens ein Zehntel eines Bildschirms.',
      'Do jede Grösse aus den sechs Typo-Tokens nehmen und jeden Abstand aus dem 4-px-Raster.',
      'Do Kontraste rechnen, bevor eine Palettenänderung als fertig gilt.',
      'Do Listenzeilen mit einer Linie trennen und Karten für echte Objekte reservieren.',
      'Do jeden Zustand entwerfen: Fehler, leer, lädt, Fokus, deaktiviert.',
      'Do Bewegung nur dort, wo sie etwas mitteilt — und alles unter prefers-reduced-motion neutralisieren.',
    ],
    donts: [
      'Don\'t eine Pixelgrösse von Hand schreiben oder einen Abstand ausserhalb des Rasters.',
      'Don\'t eine Kiste um etwas bauen, das kein Objekt ist.',
      'Don\'t einen farbigen Streifen an die Kante einer Karte setzen.',
      'Don\'t ein Symbol in ein abgerundetes Quadrat über eine Überschrift stapeln.',
      'Don\'t eine versale Beschriftung setzen, die den Reiter direkt darüber wiederholt.',
      'Don\'t einen pulsierenden Punkt auf eine Angabe setzen, die sich nie ändert.',
      'Don\'t Inter, Roboto oder system-ui als Fliesstextschrift einsetzen.',
      'Don\'t den Dunkelmodus aus dem hellen invertieren.',
    ],
  },
}

const out = path.join('.impeccable', 'design.json')
fs.mkdirSync('.impeccable', { recursive: true })
fs.writeFileSync(out, JSON.stringify(design, null, 2) + '\n', 'utf8')
console.log(`${out} geschrieben — ${design.components.length} Komponenten, ${Object.keys(design.extensions.colorMeta).length} Farben mit Tonleiter`)
