---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/components/Dashboard.tsx","src/components/AppShell.tsx","src/components/Home.tsx"]
---

# Surface brief — Sondra Studio (src/App.tsx)

Scope: the whole application shell and every tool surface inside it.
Visitor mode: **Operate.** Someone arrives with a file and a job. Two small
exceptions inside the same world: the section index reads (Read), and the
downloader's not-local warning has to be believed before anything is typed
(Persuade).

Audience: musicians who produce their own material and speak the vocabulary
(LUFS, True Peak, Stems, BPM, Camelot). Also strangers arriving from a search
who know nothing and must understand in seconds what this is.

Job: do one thing to a file — measure it, cut it, separate it, convert it,
analyse it — and often a second thing to the result.

Constraints, binding: the colours (#f4f3ee paper, #0f3e1c ink, the dark
theme); logo and wordmark unchanged; German, Sie-form, sober; every current
tool stays reachable; the downloader's not-local warning stays visible and
unvarnished. No fabricated evidence of any kind.

## Direction contract

**THESIS.** Sondra is a measuring instrument that issues a report, and the
interface is that report. It refuses the category default — dark chrome, a
neon accent, a waveform as hero — and equally refuses that default's
predictable opposite, the airy white page with a large serif headline and a
lot of breathing room, which is exactly what this app was before this pass.
The one idea it owns: every screen states what was measured, with what, and
under what method.

**OWN-WORLD.** A Swiss calibration certificate. Warm paper is the sheet;
white appears only where a field is fillable; Forest Ink is the printing ink,
spent on rules, section numbers and the single action per section; the
hairline is the ruled line of a table. Everything composes as a ruled
two-column table: label left, value right-aligned, unit in its own narrow
column. Section numbers (1, 1.1, 1.2) sit in the left margin, outside the
text column, forming one continuous vertical axis down the whole page. State
is a mark in that margin, not a sentence: an em dash for not yet measured, a
filled dot for measured, an exclamation for outside tolerance. No rounded
cards, no shadow on any document surface; depth exists only where something
genuinely floats above the sheet — the editor stage and the crop overlay.
Type is the form and the fill: a workhorse grotesque with official-document
lineage sets the printed form, and a typewriter face sets values that were
*entered* — measured results, file names, timecodes — so the eye separates
what the form says from what the machine found. No display serif: a test
report has no display face, and the one it had is on the list of faces a
model reaches for without looking.

**STORY.** The visitor sees, inside one viewport, a document that names the
instrument (this browser), the method (local, WebAssembly) and the date, then
the object under test (their file) and the procedures available to it. They
believe it because every number carries its method and none is rounded into a
claim. They pick a procedure, run it, and read the result off a line that
looks the same as every other line they have read here.

**FIRST VIEWPORT.** A ruled header block the full width of the sheet: the
wordmark left, unchanged; right, three key/value lines — Gerät, Verfahren,
Stand. A full-width hairline under it. Then `1 Prüfgegenstand`: the open file
as a ruled table of measured facts, or, when nothing is open, the same table
with its fields visibly blank and the two ways to fill them as the section's
action. Then `2 Verfahren`, the tool itself. The primary action sits at the
foot of its section, right-aligned to the value column, where a form's submit
sits after its fields. The thirty tools are `3 Verfügbare Verfahren`, a
numbered ruled index, never a grid of tiles.

**FORM.** Prüfprotokoll / Eichschein — a Swiss calibration certificate.
Position 7 of 7 on the ordered grounded list, which is the assignment the
roll made. Seed key `c8cd9136`, mode `operate`. Raised by four donations from
declined challengers: addressability (Teletext), state as a colour law rather
than a sentence (Arcade), one continuous axis ruling every line (Deep dive),
and a drawn rather than hidden armature (Crouwel). Competitive alternates
that were not taken: the CD-ROM console and the Miura fold.

**FINISH.** unreviewed and undocumented is unfinished; this build ends with
the finish review, the verdict, DESIGN.md, and every shipping raster carrying
its provenance

## Unresolved

- Whether the editor stage keeps its neutral dark or becomes a mounted plate
  on the sheet. Decided at build time by what the crop overlay needs.
- Typewriter face at small sizes across long German tables: watch the measure.
