# Sondra

Deutschsprachiges Medienstudio, das im Browser rechnet. Vite 7 · React 19 ·
TypeScript · Tailwind v4 · zustand. Oberflächentexte sind **Deutsch**,
Codekommentare **Englisch**.

## Design Guidelines (anti-AI-slop, established 2026-09-19)

This project had an explicit design pass to remove generic "AI-generated"
design patterns. The direction below is a deliberate choice, not a placeholder —
don't drift back toward defaults when adding new UI.

**Committed direction — "a Swiss measuring instrument on warm paper":**

- **Color.** Warm paper `--color-canvas: #f4f3ee` and white cards carry ~90% of
  every screen; **Forest Ink `--color-ink: #0f3e1c` is the only accent** and
  means exactly one thing: *you can act on this* (filled button, active tab,
  focus ring, heading). If the green is on more than about a tenth of a screen
  it has stopped being an accent. Dark mode is a separate remap with its own
  measured contrast, never an inversion. The editor stage
  (`--color-stage-*`) is a neutral dark on purpose: it is the one surface whose
  job is to not lie about the colours of the picture on it.
- **Contrast is measured, not eyeballed.** APCA: body ≥ Lc 75, secondary text
  ≥ Lc 60, headings ≥ Lc 45, dividers and other non-text ≥ Lc 15. A palette
  change is not done until it has been run through the numbers. This pass
  found a dark-mode divider sitting at **Lc 0.0** — invisible, on the token
  that separates every container in the app.
- **Typography.** Cormorant Garamond (display, weight 300) for the display
  line; **Archivo** for everything else — a grotesque in the Swiss lineage with
  the square terminals and real tabular figures a tool full of dB, LUFS, BPM
  and timecodes needs. Both self-hosted under `public/fonts`, no CDN.
  Scale is ×1.25 (major third) from a 16px body, and it has exactly six steps:
  `text-micro` 11 · `text-small` 13 · `text-body` 16 · `text-subheading` 20 ·
  `text-heading-sm` 25 · `text-heading` 39. **Use the tokens.** Do not write
  `text-[12px]`; two sizes a pixel apart are not a hierarchy.
- **Spacing.** A 4px grid. Every padding, margin and gap is a multiple of four
  (2px exists as a half-step for hairline offsets and nothing else). More space
  around what matters more — a system is not the same as sameness.
- **Icons.** The project's own 16px/20px stroke set in `components/panelMeta.tsx`
  and `components/editor/icons.tsx`. One set, drawn on one grid, used only
  where the icon carries information. No icon libraries, no emoji.
- **Depth.** Exactly two levels, `--shadow-card` and `--shadow-lift`, and they
  mean "this lies on the canvas" and "this is being pointed at". Nothing else
  gets a shadow.
- **Motion.** Four movements and no fifth: `rise` (something arrived), `pop` (a
  figure was just computed), `sweep` (a bar fills), `press` (a control answers
  the pointer). Three durations, two easings, all in `styles/theme.css`.
  Transform and opacity only; `prefers-reduced-motion` neutralises all of it.

**Hard bans — do not reintroduce these, even as a quick placeholder:**

- Purple/indigo → blue or violet → cyan gradients (the Tailwind-default look)
- Inter/Roboto/system-ui as the body face, or a "safe alternative" (Geist,
  Space Grotesk, Poppins) swapped in without a real reason
- `rounded-2xl shadow-lg`-style defaults applied to every container by reflex
- Glassmorphism, neon glow, decorative dot-grid or gradient-orb backgrounds
- A colored accent strip down the left edge of a card
- **An icon in a rounded square stacked above a heading** — this app had that
  on its start screen and it is the single most recognisable generated-UI tell
- **An all-caps `<Eyebrow>` that restates the tab or heading right above it.**
  An eyebrow labels a *region the reader cannot otherwise name* ("Ergebnis",
  "Zielwerte"). Eleven of them here were repeating the selected tab.
- **A pulsing dot on information that does not change.** `pulse-dot` is for
  something genuinely running.
- An even grid of identically-sized cards used for what is really a list
- Emoji as functional icons; stock photography; 3D gradient blobs
- The hero → eyebrow pill → centred headline → three feature cards → CTA
  template
- Copy clichés, German included: „nahtlos", „mühelos", „revolutionär",
  „spielend leicht", „Erleben Sie", „das volle Potenzial", „in der heutigen
  schnelllebigen Welt", headlines that could describe any product
- The Gedankenstrich doing every job in a paragraph. It is ordinary German
  punctuation, but when four sentences in a row hinge on one, vary it.
- Shipping a component with no error / empty / loading / focus / disabled state

**When adding new UI or copy:** check it against this list before considering it
done. If a new pattern doesn't fit anything above and you're reaching for a
default, stop and make an actual decision instead — consistent with the
direction above, not with whatever a starter template would produce. If the
direction stops fitting the product, update this block deliberately rather than
letting it drift.

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
