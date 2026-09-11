/**
 * Navigation, hero, explanation and footer.
 *
 * The hero follows the system's two-column split: a Keylime Wash panel carrying
 * the serif headline and the call to action, and a Slate Hush panel holding the
 * product preview cards — the only cool-toned surface in the palette, reserved
 * for showing the product itself.
 */

import { useSession } from '../state/store'
import { ArrowRight, Badge, Button, Card, Eyebrow } from './ui/primitives'

const NAV_LINKS = [
  { href: '#studio', label: 'Studio' },
  { href: '#architektur', label: 'Architektur' },
  { href: '#fragen', label: 'Fragen' },
]

export function Nav() {
  return (
    <header className="shell flex flex-wrap items-center justify-between gap-[14px] py-[21px]">
      <a href="#top" className="flex items-center gap-[11px] rounded-nav">
        <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
          <rect width="32" height="32" rx="7" fill="#0f3e17" />
          <g stroke="#e1f4df" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 12v8" />
            <path d="M16 8v16" />
            <path d="M20 11v10" />
            <path d="M24 14v4" />
          </g>
        </svg>
        <span className="font-display text-[23px] font-light tracking-[-0.01em] text-forest-ink">Lizge</span>
      </a>

      <nav className="flex items-center gap-[4px]">
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="rounded-nav px-[11px] py-[7px] text-body text-charcoal transition-colors hover:bg-keylime-wash"
          >
            {link.label}
          </a>
        ))}
        <a
          href="#studio"
          className="ml-[7px] rounded-pill bg-forest-ink px-[18px] py-[9px] text-body text-cream-paper transition-colors hover:bg-forest-shadow"
        >
          Loslegen
        </a>
      </nav>
    </header>
  )
}

/** Miniature of a panel, in the manner of a printed screenshot. */
function PreviewCard({
  title,
  caption,
  children,
}: {
  title: string
  caption: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-card bg-cream-paper p-[21px]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-forest-ink/70">{title}</p>
      <div className="my-[14px]">{children}</div>
      <p className="text-[12px] leading-[1.45] text-charcoal/65">{caption}</p>
    </div>
  )
}

function MiniWave() {
  const bars = [8, 20, 34, 26, 44, 30, 52, 38, 24, 42, 18, 30, 12, 26, 16, 8]
  return (
    <div className="flex h-[52px] items-center gap-[3px]" aria-hidden>
      {bars.map((height, index) => (
        <span
          key={index}
          className="w-[4px] rounded-pill bg-forest-ink"
          style={{ height: `${height}px`, opacity: index % 3 === 0 ? 0.85 : 0.35 }}
        />
      ))}
    </div>
  )
}

function MiniMeter() {
  return (
    <div className="flex flex-col gap-[9px]" aria-hidden>
      {[
        { label: '−23', width: '38%' },
        { label: '−14', width: '64%' },
        { label: '−9', width: '82%' },
      ].map((row) => (
        <div key={row.label} className="flex items-center gap-[9px]">
          <span className="numeric w-[26px] text-[10px] text-charcoal/55">{row.label}</span>
          <span className="h-[6px] flex-1 overflow-hidden rounded-pill bg-forest-ink/12">
            <span className="block h-full rounded-pill bg-forest-ink" style={{ width: row.width }} />
          </span>
        </div>
      ))}
    </div>
  )
}

function MiniStems() {
  const stems = ['Gesang', 'Schlagzeug', 'Bass', 'Übriges']
  return (
    <ul className="flex flex-col gap-[7px]" aria-hidden>
      {stems.map((stem, index) => (
        <li key={stem} className="flex items-center gap-[9px]">
          <span className="h-[5px] flex-1 overflow-hidden rounded-pill bg-forest-ink/12">
            <span
              className="block h-full rounded-pill bg-forest-ink"
              style={{ width: `${[72, 54, 40, 86][index]}%` }}
            />
          </span>
          <span className="w-[68px] text-[10px] text-charcoal/60">{stem}</span>
        </li>
      ))}
    </ul>
  )
}

export function Hero() {
  const setPanel = useSession((state) => state.setPanel)

  return (
    <section id="top" className="shell pb-[56px] pt-[14px] sm:pb-[76px]">
      <div className="grid gap-[21px] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <Card tone="keylime" className="flex flex-col justify-between p-[28px] sm:p-[42px]">
          <div>
            <Badge>Nichts wird hochgeladen</Badge>
            <h1 className="display-xl mt-[21px] max-w-[13ch]">Ihre Medien verlassen diesen Tab nicht.</h1>
            <p className="mt-[21px] max-w-[46ch] text-subheading leading-[1.5] text-charcoal/80">
              Lizge ist eine statische Website. Der Server liefert einmal HTML, JavaScript und
              WebAssembly aus — danach rechnet ausschließlich Ihr Gerät. Konvertieren, Spuren trennen,
              nach EBU R128 normalisieren, sampeln.
            </p>
          </div>

          <div className="mt-[42px] flex flex-wrap items-center gap-[11px]">
            <a
              href="#studio"
              onClick={() => setPanel('converter')}
              className="inline-flex items-center gap-2 rounded-card bg-forest-ink px-[21px] py-[14px] text-body text-cream-paper transition-colors hover:bg-forest-shadow"
            >
              Datei öffnen
              <ArrowRight />
            </a>
            <a
              href="#architektur"
              className="inline-flex items-center gap-2 rounded-card px-[21px] py-[14px] text-body text-forest-ink transition-colors hover:bg-cream-paper"
            >
              Wie das funktioniert
            </a>
          </div>
        </Card>

        <Card tone="slate" className="p-[28px] sm:p-[42px]">
          <div className="flex flex-col gap-[14px]">
            <PreviewCard title="Konverter" caption="FFmpeg als WebAssembly, in einem Web Worker.">
              <MiniWave />
            </PreviewCard>
            <PreviewCard title="Lautheit" caption="Integriert, Loudness Range und True Peak.">
              <MiniMeter />
            </PreviewCard>
            <PreviewCard title="Spuren" caption="Vier Masken, die sich zum Original ergänzen.">
              <MiniStems />
            </PreviewCard>
          </div>
        </Card>
      </div>
    </section>
  )
}

const ARCHITECTURE = [
  {
    eyebrow: 'Auslieferung',
    title: 'Der Server kennt nur den Code',
    body:
      'Es gibt keine API, keine Datenbank, keinen Upload-Endpunkt. Das Deployment ist ein Ordner mit statischen Dateien. Was nach dem ersten Laden passiert, sieht der Server nicht — er wird gar nicht mehr gefragt.',
  },
  {
    eyebrow: 'Rechnen',
    title: 'WebAssembly statt Rechenzentrum',
    body:
      'FFmpeg ist nach WebAssembly übersetzt und läuft im Tab. Die Datei landet in einem In-Memory-Dateisystem, wird dort transkodiert und wieder ausgelesen. Der Verlauf ist derselbe wie auf der Kommandozeile, nur ohne Festplatte.',
  },
  {
    eyebrow: 'Nebenläufigkeit',
    title: 'Web Workers halten die Oberfläche frei',
    body:
      'Lautheitsmessung, Spurentrennung und Phasenvocoder laufen in eigenen Worker-Threads. Audio wandert als übertragbarer Puffer hin und zurück, wird also verschoben statt kopiert.',
  },
  {
    eyebrow: 'Beschleunigung',
    title: 'Mehrere Kerne, wo der Browser es zulässt',
    body:
      'Mit COOP- und COEP-Headern steht SharedArrayBuffer bereit, und FFmpeg nutzt mehrere Threads. Fehlen die Header, lädt die einfädige Variante — langsamer, aber vollständig funktionsfähig.',
  },
]

export function Architecture() {
  return (
    <section id="architektur" className="shell py-[56px] sm:py-[76px]">
      <Eyebrow>Architektur</Eyebrow>
      <h2 className="display-lg mt-[14px] mb-[42px] max-w-[18ch]">Kein Server, der etwas mitbekommen könnte</h2>

      <div className="grid gap-[14px] sm:grid-cols-2">
        {ARCHITECTURE.map((entry, index) => (
          <Card key={entry.title} tone={index % 3 === 0 ? 'sage' : index % 3 === 1 ? 'keylime' : 'mint'}>
            <Eyebrow>{entry.eyebrow}</Eyebrow>
            <h3 className="display-sm mt-[11px] mb-[11px]">{entry.title}</h3>
            <p className="text-body leading-[1.6] text-charcoal/80">{entry.body}</p>
          </Card>
        ))}
      </div>
    </section>
  )
}

const FAQ = [
  {
    question: 'Wird wirklich nichts übertragen?',
    answer:
      'Die Anwendung selbst stellt keine Netzwerkanfrage, die Ihre Medien enthält. Schriften, WebAssembly-Module und Code kommen vom eigenen Ursprung, nicht von fremden CDNs. Die einzige Ausnahme ist der Downloader — dort geben Sie bewusst eine Adresse ein, und Ihr Browser holt sie direkt. Beobachten lässt sich das im Netzwerk-Tab der Entwicklerwerkzeuge.',
  },
  {
    question: 'Warum scheitert der Download bei großen Portalen?',
    answer:
      'Weil deren Server dem Browser den Zugriff von fremden Seiten aus verbieten. Übliche Downloader umgehen das, indem sie die Datei auf ihrem eigenen Server abholen — dabei sehen sie Adresse, Zeitpunkt und IP. Lizge verzichtet darauf und sagt lieber, dass es nicht geht.',
  },
  {
    question: 'Wie gut ist die Spurentrennung ohne neuronales Modell?',
    answer:
      'Sie ist brauchbar für Karaoke, Remix-Vorarbeit und das Herauslösen von Schlagzeug, aber sie erreicht kein Demucs. Das Verfahren nutzt Medianfilter zur Trennung harmonischer und perkussiver Anteile sowie die Mittenkohärenz für den Gesang. Wer mehr braucht, lädt ein eigenes ONNX-Modell — das läuft dann ebenfalls lokal.',
  },
  {
    question: 'Sind die Lautheitswerte verlässlich?',
    answer:
      'Es ist eine vollständige Umsetzung von BS.1770-4: K-Bewertung über zwei Filterstufen, 400-Millisekunden-Blöcke mit 75 Prozent Überlappung, absolutes Gate bei −70 LUFS und relatives Gate bei −10 LU. Dazu Loudness Range nach Tech 3342 und True Peak mit vierfacher Überabtastung.',
  },
  {
    question: 'Was passiert beim Schließen des Tabs?',
    answer:
      'Alles ist weg. Es gibt keinen localStorage, keine IndexedDB, keine Cookies für Ihre Medien. Was Sie behalten wollen, speichern Sie ausdrücklich als Datei.',
  },
]

export function Faq() {
  return (
    <section id="fragen" className="shell py-[56px] sm:py-[76px]">
      <Eyebrow>Fragen</Eyebrow>
      <h2 className="display-lg mt-[14px] mb-[42px] max-w-[16ch]">Was Sie vermutlich wissen wollen</h2>

      <dl className="flex flex-col">
        {FAQ.map((entry) => (
          <div
            key={entry.question}
            className="grid gap-[14px] border-b border-border-mist py-[28px] first:pt-0 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-[42px]"
          >
            <dt className="display-md text-[28px] leading-[1.25] sm:text-[32px]">{entry.question}</dt>
            <dd className="text-body leading-[1.65] text-charcoal/80">{entry.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="shell flex flex-wrap items-center justify-between gap-[21px] border-t border-border-mist py-[42px]">
      <div className="flex flex-col gap-[7px]">
        <span className="font-display text-[23px] font-light text-forest-ink">Lizge</span>
        <p className="max-w-[44ch] text-[12px] leading-[1.6] text-charcoal/60">
          Statisch ausgeliefert, lokal gerechnet. Quelloffene Bausteine: FFmpeg (WebAssembly),
          ONNX Runtime Web, Wavesurfer, Tone.js.
        </p>
      </div>
      <div className="flex flex-wrap gap-[7px]">
        <Badge>Keine Uploads</Badge>
        <Badge>Keine Cookies</Badge>
        <Badge>Kein Tracking</Badge>
      </div>
    </footer>
  )
}

export function PrivacyBanner() {
  const assets = useSession((state) => state.assets)
  if (assets.length === 0) return null

  const totalBytes = assets.reduce((sum, asset) => sum + asset.sizeBytes, 0)
  return (
    <div className="shell">
      <div className="flex flex-wrap items-center justify-between gap-[14px] rounded-card bg-mint-veil px-[21px] py-[14px]">
        <p className="text-[13px] text-charcoal/80">
          {assets.length} {assets.length === 1 ? 'Datei' : 'Dateien'} im Arbeitsspeicher dieses Tabs ·{' '}
          {(totalBytes / 1024 / 1024).toFixed(1)} MB. Nichts davon wurde gesendet.
        </p>
        <Button size="sm" variant="quiet" onClick={() => useSession.getState().clearAssets()}>
          Speicher freigeben
        </Button>
      </div>
    </div>
  )
}
