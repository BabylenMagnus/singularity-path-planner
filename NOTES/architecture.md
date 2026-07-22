# Code architecture

How the planner logic is split into modules, so a new planner mode (or a fix
to an existing one) lands in the right file. Split 2026-07-20 out of a single
1170-line `pathSearch.js` once a third planner (node rush) made "one big
file" unworkable.

## The search engine: `js/searchCore.js`

Everything shared by every planner lives here — nothing planner-specific:

- Low-level projection: `growthIntegral`, `project` (mult-free growth-time
  integrals, cached on `ctx`).
- Core state transitions: `grind` (one Sing), `upgrade` (buy a tree-node
  level), `finalPushTo` (grind to a large atom exponent, then Singularize —
  used by the push planner).
- The Dijkstra engine: `MinHeap`, `searchUpgradePrefix` (Phase 1: cheapest
  sequence of tree-node purchases to a "shortcut" callback).
- The Phase-2 local-search engine: `tryInsertImprovements`, `evaluateSequence`,
  `neighborSequences` (beam search over insert/swap/remove moves on an
  action sequence).
- The atomic-action replay dispatcher: `replaySteps`, `replayActionsPartial`
  (turns a flat `["grind", "upgrade_1.0", "final_push", ...]` list back into
  states + per-step timings — this is what the UI calls to redraw a saved
  scenario).
- Batch-sing math: `getSingTrajectory`, `applyGrinds`, `grindRepeatCount`
  (the `grind_xN` compaction so the UI never has to hold 100k individual rows).

**Rule**: if two planners need it, it goes here. If only one planner needs
it, it stays in that planner's own file.

## The three planners

- **`js/pathSearch.js`** — mult-goal planner (`findOptimalPath`,
  `expandPath`): "reach Singularity Mult X as fast as possible." Also
  re-exports the other two planners' public functions (and searchCore's
  shared exports like `replayActionsPartial`), so `app.js` and
  `optimizer.worker.js` only ever need one import line:
  `import { findOptimalPath, findPushPathVariants, findNodeRushPath, ... } from "./pathSearch.js"`.
  This re-export indirection is deliberate — it means the module boundary
  between search-core/push/rush is an implementation detail call sites don't
  need to know about.

- **`js/pushPlanner.js`** — push-target planner (`findPushPathVariants`,
  `expandPushPath`, `rankPushTreeUpgrades`): "reach a sequence of large atom
  thresholds (10^x each) as fast as possible, ending each segment in one long
  grind ('final push') that also Singularizes." Adds `bestSingsThenPush`
  (how many plain Sings before the push pays off — a unimodal search using
  cached mult trajectories) and the three-variant comparison (optimal / extra
  tree / sings only) plus the "rank +1 on each node" feature.

- **`js/nodeRush.js`** — single-node rush planner (`findNodeRushPath`): "get
  ANY of the 13 tree nodes to ascension:level X as fast as possible, buying
  STN 1.0/3.1/3.2 or grinding Sings along the way if that's faster." Unlike
  the other two, there's no cheap "shortcut" callback for a level target
  (nothing plays `grindToGoal`'s role), so this is a plain Dijkstra with
  `grind` as a real edge — exact, not approximated, but can be slow for deep
  targets (many ascensions out); same `maxIterations` cap as the rest of the
  planner. Only 1.0/3.1/3.2 go through searchCore.js's shared `NODE_FIELDS`/
  `upgrade`/`upgradeChoices` (the "standard" nodes, also used by the other
  two planners); any other target gets a local `targetLevel`/`targetAscension`
  state field and a local `upgradeTarget` edge instead, so extending rush to
  cover all 13 nodes never touches the other planners' branching factor. A
  non-standard target's result is a time estimate only — `app.js onRushNode`
  skips scenario creation for it, since the scenario editor's replay
  (`searchCore.js stepAction`, `"upgrade_"` dispatch) only knows the 3
  standard nodes. See [model.md](model.md) "Upgrade costs" for the cost
  override plumbing (`baseCostOverrideLog10`).

## UI-side split: `js/app.js` + `js/renderHelpers.js`

`app.js` still owns all stateful UI logic (scenario CRUD, event wiring, the
worker RPC helpers `runOptimizer`/`ensureWorker`, form reading/persistence).
`renderHelpers.js` holds pure `(data) => htmlString` functions with no DOM
access and no module-level state: `stnCell`, `multCell`, `actionOptionsHtml`,
the exponent-calculator's chart/table builders. If a function doesn't touch
`document` or module state, it belongs in `renderHelpers.js`.

## The worker: `js/optimizer.worker.js`

Runs every planner off the main thread. `self.onmessage` dispatches on
`mode`: `"push"` → `optimizePush`, `"rank-tree-push"` → `rankTreeForPush`,
`"rush-node"` → `rushNode`, anything else → `optimize` (mult-goal). Each
handler converts the planner's LogNum-bearing internal states into plain
`[action, dt, mult]` triples before `postMessage`, since LogNum instances
can't survive structured clone across the worker boundary.

## Formulas: `js/atomPenalties.js`, `js/singularize.js`, `js/tree.js`, `js/growth.js`

Pure math, no search logic. `atomPenalties.js` owns the atom-threshold table
and the RN126/127/128/131 leveled formulas (added 2026-07-20 — see
[community-spreadsheet.md](community-spreadsheet.md)). `singularize.js` owns
tree-node effects and the Singularize mult-gain formula. `tree.js` owns
upgrade costs. `growth.js` owns the compound-growth projector.

## Cache-busting: every local import carries `?v=<tag>`

Every relative `import ... from "./x.js"` in every file, the `<script>`/
`<link>` tags in `index.html`, and the `new URL("./optimizer.worker.js", ...)`
call in `app.js` all carry the identical query-string tag (e.g. `?v=20260720c`).
This is not decorative — the browser treats `x.js` and `x.js?v=A` as different
cache entries, and a stale cached module can silently pair with a fresh one
that expects an export it doesn't have (hit 2026-07-20: an old cached
`tree.js` without `advanceByBuys` next to a new `app.js` that imported it —
`Uncaught SyntaxError: The requested module './tree.js' does not provide an
export named 'advanceByBuys'`, which aborts module evaluation entirely, so
`init()` never runs and the page looks like it "reset" even though
localStorage is untouched).

**Whenever any `.js` file's content changes, bump the tag everywhere in the
same edit** (all files must carry the exact same tag — two different tags
for the same file create two separate module instances with independent
module-level state, which is its own bug). One command does the whole
project:

```sh
python -c "
import re, pathlib
VERSION = 'YYYYMMDDx'  # bump the trailing letter (or date) on every change
base = pathlib.Path('js')
pattern = re.compile(r'''from\s+([\"'])(\./[^\"']+?\.js)(?:\?v=[^\"']*)?\1''')
for f in list(base.glob('*.js')):
    t = f.read_text(encoding='utf-8')
    t2 = pattern.sub(lambda m: f'from {m.group(1)}{m.group(2)}?v={VERSION}{m.group(1)}', t)
    if t2 != t: f.write_text(t2, encoding='utf-8')
"
```
Then update `index.html`'s `<script src="js/app.js?v=...">` /
`<link href="style.css?v=...">` and `app.js`'s
`new URL("./optimizer.worker.js?v=...", import.meta.url)` to match. Verify
with `grep -roh "?v=[a-z0-9]*" js/*.js | sort -u` — must print exactly one line.

## Adding a new planner mode

1. Decide if it needs new shared primitives (searchCore.js) or is
   self-contained (its own new file, importing from searchCore.js).
2. Add the planner function, exported.
3. Re-export it from `pathSearch.js` if `app.js`/the worker should import it
   from there (keeps the single-import-line convention).
4. Add a `mode` branch in `optimizer.worker.js`'s `self.onmessage`.
5. Add the UI trigger (button + handler) in `app.js`, form fields in
   `index.html`, tooltip copy in `tooltips.js`.
6. Update [model.md](model.md) / [gaps.md](gaps.md) if it uses or exposes
   new formulas, and log it in [changelog.md](changelog.md).
