---
name: Revidle Singularity Path Planner
description: Instrument-panel planner for Revolution Idle's Singularity layer — enter stats, get the fastest path.
colors:
  bg: "#f6f7f9"
  bg-dark: "#14161a"
  panel-bg: "#ffffff"
  panel-bg-dark: "#1d2026"
  text: "#1a1d23"
  text-dark: "#e7e9ee"
  muted: "#5b6472"
  muted-dark: "#9aa3b2"
  border: "#d8dce2"
  border-dark: "#333842"
  primary: "#3b6ff0"
  primary-dark: "#6d93f7"
  primary-text: "#ffffff"
  primary-text-dark: "#0c1220"
  danger: "#d24545"
  danger-dark: "#ef6a6a"
  row-blocked: "#fdeaea"
  row-blocked-dark: "#3a1f22"
  row-start: "#eef2fb"
  row-start-dark: "#202a41"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 700
    lineHeight: 1.3
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.4
  data:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 400
    lineHeight: 1.35
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-secondary:
    backgroundColor: "{colors.panel-bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-danger:
    backgroundColor: "{colors.panel-bg}"
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  panel:
    backgroundColor: "{colors.panel-bg}"
    rounded: "{rounded.lg}"
    padding: "18px 20px"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
  badge:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: Revidle Singularity Path Planner

## 1. Overview

**Creative North Star: "The Instrument Panel"**

This is a bank of gauges and switches for someone mid-run, not a showroom.
Every screen exists to answer one question fast: what do I buy next, how
long does this take, which plan wins. The interface borrows its restraint
from cockpit instrumentation — dense, legible, low-glare — rather than from
product marketing. Precision is the entire aesthetic: numbers align, borders
are crisp, nothing moves unless a value changed.

It explicitly rejects the SaaS-landing register: no gradient hero sections,
no card grids selling a feature, no promotional chrome. The accent blue
exists to mark state and action (active tab, primary button, badge, live
number), never to decorate. When the Singularity Tree gets its radial
star-shaped view, it earns visual distinctiveness there — the one place a
brighter, more atmospheric treatment is allowed — precisely because
everywhere else stays instrument-flat, so that one departure reads as
"the game's own shape," not stylistic drift.

**Key Characteristics:**
- Flat, border-defined surfaces; shadows are earned, not default.
- One accent color, used sparingly and only for state/action.
- System font stack — no custom display face; legibility over character.
- Dense data tables and inline-editable numeric fields as first-class content.
- Light and dark themes are equally primary (`prefers-color-scheme`), not a
  dark-mode afterthought.

## 2. Colors

A restrained neutral-gray system with a single working accent; no secondary
or tertiary color roles exist yet, and none should be added without a
functional reason (a new distinct state, not decoration).

### Primary
- **Instrument Blue** (`#3b6ff0` light / `#6d93f7` dark): the one accent.
  Marks the active tab, primary actions ("Find Optimal Path", "Find Push
  Path"), badges (scenario slot numbers), and the live/primary number in a
  paired stat (`.mult-main`, tree-rank "best save" row). Never used as a
  background fill for large areas.

### Neutral
- **Panel White / Near-Black** (`#ffffff` light / `#1d2026` dark,
  `panel-bg`): the surface every card, table, and modal sits on.
- **Cool Gray Canvas** (`#f6f7f9` light / `#14161a` dark, `bg`): the page
  background, one step back from panels; also the fill for input fields so
  they read as recessed relative to their panel.
- **Ink** (`#1a1d23` light / `#e7e9ee` dark, `text`): primary text. Passes
  AA at body size against both `bg` and `panel-bg`.
- **Muted Slate** (`#5b6472` light / `#9aa3b2` dark, `muted`): labels,
  subtitles, table headers, secondary numbers (deltas, sub-values). Verify
  4.5:1 before using at body size; if a use case needs smaller-than-body
  text in this color, promote it toward `text` instead of shrinking further.
- **Hairline Border** (`#d8dce2` light / `#333842` dark): every card,
  input, and table-row divider. The system's only structural device —
  see the Ledger-Line Rule below.
- **Danger Red** (`#d24545` light / `#ef6a6a` dark): destructive actions
  (Clear All Plans), blocked-path rows, error status text. Reserved
  exclusively for "this is wrong / this will delete something."
- **Blocked Row Wash** (`#fdeaea` light / `#3a1f22` dark) and **Start Row
  Wash** (`#eef2fb` light / `#202a41` dark): full-row background tints in
  the steps table, tied 1:1 to `danger` and `primary` respectively at low
  opacity-equivalent lightness. Never introduce a third row-wash color
  without a third semantic row state to justify it.

### Named Rules
**The Ledger-Line Rule.** Depth and grouping come from 1px borders, not
shadows or fills. If a new component needs to signal "this is a distinct
group," reach for `border: 1px solid var(--border)` before reaching for a
background change or a shadow.

**The One Accent Rule.** Instrument Blue is the only color that means
"active/primary/live." Do not introduce a second blue, a green-for-success,
or any other "positive" hue without a state that red/gray/blue cannot
already express — the tree-rank table's `save-pos`/`save-neg` green/red pair
is the sanctioned exception (a genuine third state: better / worse / no
change), not a precedent for decorative color.

## 3. Typography

**Body/UI Font:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
Helvetica, Arial, sans-serif` (system stack, no webfont load)
**Label/Mono Font:** none distinct — numeric data uses the same system stack
at tighter sizes; a monospace/tabular-nums treatment is a candidate
improvement for the tree UI (see Do's and Don'ts) but not yet adopted
project-wide.

**Character:** One typeface family carrying the whole hierarchy through
weight and size alone — deliberately restrained, matching "precise, dense,
no ornament." There is no display face because this system has no hero
moment to earn one.

### Hierarchy
- **Headline** (700, 1.6rem, 1.25 line-height): page `<h1>` only, one per
  page.
- **Title** (700, 1.15rem, 1.3): section `<h2>` ("Current stats",
  "Scenarios").
- **Label** (600, 0.95rem, muted color, 1.3): `<h3>` sub-headers within a
  panel ("Tree state"), always in `--muted`, never full `--text` weight —
  this is what keeps them from competing with real content.
- **Body** (400, 0.9rem, 1.4): paragraph copy, subtitles, status messages.
  Subtitle max-width already capped at 70ch.
- **Data** (400, 0.82rem, 1.35): form labels, table cells, scenario stats —
  the actual numbers users came here to read. This is the highest-traffic
  size in the system; legibility here matters more than anywhere else.

### Named Rules
**The Muted-Header Rule.** Every `<h3>` is `--muted`, never `--text`. A
section label should announce a group without competing with the numbers
inside it for attention.

## 4. Elevation

Flat by default, and that stays doctrine: shadows are earned, not default.
Structure comes from borders and background-tier separation (`bg` →
`panel-bg`), not from drop shadows. The **only** two shadowed elements in
the system are transient overlays that must visually separate from
everything behind them: the info-icon tooltip (`0 4px 14px rgba(0,0,0,0.35)`)
and the modal (`0 12px 40px rgba(0,0,0,0.5)`). Nothing that stays on the
page at rest — panels, cards, buttons, table rows — should ever gain a
shadow; that would blur the signal these two currently carry alone.

### Shadow Vocabulary
- **Ambient Popover** (`box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35)`): the
  tooltip only. Signals "floating above the page, dismissible."
- **Modal Overlay** (`box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5)`): the
  scenario-detail modal only. Heavier than the tooltip because it sits above
  a dedicated `rgba(0,0,0,0.55)` scrim, not directly on the page.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow appears
only on a true overlay (floats above other content, has a scrim or is
positionally detached from the page flow) — never as a resting-state
decoration on a card, button, or table row. The planned Singularity Tree
radial view may use glow/blur around active or hovered star-nodes (matching
the game's own lit-up node treatment) as the one deliberate exception to
"flat" — that glow signals interactivity on a literal star-shaped UI, not
generic card lift, and should not be read as license to add shadows
elsewhere.

## 5. Components

### Buttons
- **Shape:** 6px radius (`rounded.sm`), 1px border always present even on
  primary.
- **Primary:** Instrument Blue fill, white/near-black text (`primary-text`
  per theme), 600 weight, `border-color` matches fill. Used for the single
  main action in a group (Find Optimal Path, Find Push Path, Rush node).
- **Secondary (default):** `panel-bg` fill, `text` color, `border` border.
  This is the button default — most buttons in the system are secondary;
  primary is reserved for the one action per panel that matters most.
- **Danger:** `panel-bg` fill, `danger`-colored text and border. Only for
  destructive actions (Clear All Plans) — never for a merely de-emphasized
  action.
- **Hover / Focus:** border shifts to `primary` on hover (`button:hover`);
  no fill or shadow change. Needs a `:focus-visible` outline added (currently
  relies on browser default — see Do's and Don'ts).

### Badges
- **Style:** Instrument Blue pill (`rounded.pill`), white text, 700 weight,
  0.72rem — the scenario "slot" indicator (`.slot-badge`). The only pill
  shape in the system; reserve it for short numeric/status tags, not labels.

### Cards / Containers
- **Corner Style:** 8-10px radius depending on hierarchy (panels 10px,
  nested cards like `.tree-node`/`.scenario-card` 8-10px).
- **Background:** `panel-bg`, one tier above the page `bg`.
- **Shadow Strategy:** none (see Elevation). Grouping via `border: 1px solid
  var(--border)` per the Ledger-Line Rule.
- **Border:** always 1px solid `--border`; the `.rush-node-panel` uses a
  dashed variant to read as "optional/auxiliary tool" vs. the solid-bordered
  primary panels — that dashed-vs-solid distinction is intentional and
  should be reused for any future secondary/auxiliary panel, not treated as
  a one-off.
- **Internal Padding:** 12-20px depending on density (dense table cells at
  4-8px, panels at 18-20px).

### Inputs / Fields
- **Style:** `bg`-tinted fill (recessed relative to the `panel-bg` card it
  sits in), 1px `border`, 6px radius, `data`-size text.
- **Focus:** currently relies on browser default outline — no custom
  `:focus-visible` treatment defined project-wide (gap; see Do's and Don'ts).
- **Compound inputs:** the `ascension:level` pair (`.node-io`) and
  value+mode pair (`.input-with-mode`) are the system's existing pattern for
  "one logical field, two physical inputs" — reuse this pattern for the tree
  redesign's per-node editors rather than inventing a new compound-input
  shape.

### Navigation
- **Tabs:** flat text buttons in a row, 2px bottom border, transparent by
  default; active tab gets `primary`-colored text and bottom border. No
  background fill on the active tab — border + color is the entire signal.

### Tables
- **Style:** 1px bottom-border row dividers only (no vertical rules,
  no zebra striping by default). Header row is `sticky`, `panel-bg`
  background, `muted` 600-weight text. Row-state tints (`row-start`,
  `row-blocked`) are the only exception to "no background fill," and they're
  reserved for genuine row-level state, not decoration.

### Singularity Tree (signature component, in progress)
The current "Tree state" section is a plain form grid — six labeled
`ascension:level` input pairs, no visual relationship between nodes. This is
the one place PRODUCT.md calls for matching the game's own visual language:
a radial/star layout (node 8 at the top, branching down through
7.1/7.2 → 6.1/6.2 → 5.1/5.2 → 4.1/4.2 → 3.1/3.2 → 2 → 1, mirroring the
in-game tree) so the connections between nodes are legible at a glance, not
just their individual values. When built, it should still obey the Ledger-
Line and Flat-By-Default rules for its chrome (panel, labels, connecting
lines as thin strokes in `--border` or `--muted`, not gradients) and reserve
any glow/highlight treatment for the node markers themselves, as the
system's one sanctioned "lit up" moment.

## 6. Do's and Don'ts

### Do:
- **Do** use borders (`1px solid var(--border)`) as the only structural
  device for grouping; reach for a border before a shadow or fill change.
- **Do** keep Instrument Blue reserved for state and action — active tab,
  primary button, badge, a genuinely "live/current" number.
- **Do** use the dashed-border variant for auxiliary/optional panels (the
  Rush-node panel's pattern), solid border for primary panels.
- **Do** cap subtitle/body copy at 65-75ch, as `.subtitle` already does.
- **Do** verify 4.5:1 contrast for anything in `--muted`, especially at the
  0.72-0.82rem sizes already common in this UI — small muted text is the
  system's biggest existing contrast risk.
- **Do** give every animation (including any future tree hover/glow effects)
  a `prefers-reduced-motion` fallback, per PRODUCT.md's strict WCAG AA
  requirement.

### Don't:
- **Don't** build a SaaS-landing surface: no gradient hero sections, no
  promotional card grids, no marketing chrome anywhere in this tool
  (PRODUCT.md anti-reference, verbatim).
- **Don't** add drop shadows to any resting-state surface (panel, card,
  button, table row). Shadows are reserved for the tooltip and modal only.
- **Don't** introduce a second "positive/active" hue alongside Instrument
  Blue. The tree-rank green/red pair is the one sanctioned second/third
  semantic color, tied to a genuine better/worse state, not a precedent for
  general-purpose color.
- **Don't** use `border-left`/`border-right` as a colored accent stripe on
  cards or list rows; use the full-border or row-wash patterns already in
  the system instead.
- **Don't** let the radial tree's decorative treatment (glow, atmosphere)
  leak into the rest of the UI. It is the one deliberate departure from
  flat-by-default, scoped to the tree component alone.
- **Don't** ship a component with only a default state. Every interactive
  element needs hover and a visible `:focus-visible` treatment — currently a
  gap project-wide, not just for new work.
