# Local modifications changelog

Dated log of feature/model changes to this planner (separate from the game's
own version history). Newest first.

## 2026-07-21 (RN131 max-level bug fix)
- **Fixed: RN131's "maxed" checkbox was mapping to level 10, but its real
  in-game max is 1.** RN126/127/128/136 really are 0-10 scales; RN131 isn't
  — the "maxed → 10" pattern was copied to all five RN fields uniformly when
  they were added (2026-07-20) without checking RN131 specifically. Confirmed
  the real cap is 1 against three independent community-spreadsheet exports
  (all showed level 1 as maxed). Root-caused a user report of the site
  predicting a push in 1h51m that took 7h+ in-game: RN131's Atom Gain buff
  (`1 + 0.005×count×level`) was inflated ~3.3x (level 10 vs the real level 1
  at their Singularity Count of 70), which alone accounted for most of the
  gap once the search engine's own formulas were cross-checked line-by-line
  against two different community spreadsheets and found to already match.
  `js/app.js readRnLevel` gained a `maxLevel` parameter (defaults to 10,
  RN131's call site passes 1); `index.html`'s RN131 input `max` dropped from
  10 to 1. See [model.md](model.md) for the full numbers.

## 2026-07-20 (Total Mult is now breakdown-only)
- **Removed the standalone "Total Mult (as shown in game)" input** from the
  top stats grid. "Total Mult" now lives only inside the (now open-by-default)
  breakdown panel, as a `readonly` field showing the live product of the
  factors below it — there's no separate place to type a flat number
  anymore, closing the "which field do I actually fill in" confusion from
  having two. `js/app.js onMultBreakdownInput` is the only thing that ever
  writes to `#total-mult-shown` now; a fresh page (nothing persisted yet)
  shows "1" (the all-defaults product) instead of a blank field.
  (`index.html`, `js/app.js`, `style.css input[readonly]`.)
- Bumped the cache-busting tag (`?v=20260720d`, see
  [architecture.md](architecture.md) "Cache-busting") since this touched
  `app.js`/`index.html`/`style.css`/`tooltips.js`.
- Verified with a headless browser: fresh load shows "1", typing into the
  Total Mult field is rejected by the browser itself (`readonly`), filling
  a breakdown factor (Vessel = 1.037) updates it live to "1.037". No console
  errors.

## 2026-07-20 (Total Mult breakdown)
- **"Total Mult breakdown" details panel**, collapsed by default under
  "Total Mult (as shown in game)": Vessel, Plague, Relic 38, Relic 67, Atoms
  (Atom Overflow), Sing Count factor (Loop Feeds Loop), Rf Node 125,
  Singular Zodiacs, Sing Mult Factor, and the 4 Tarot King completion
  checkboxes (×1.35 each) -- the same factor list as the community
  spreadsheet's Total Mult formula (`community-spreadsheet.md`), minus
  STN 1.0's own tree bonus (already computed from the tree star, not
  duplicated here) and the Soul Shop bonus (already its own field,
  `shopMultGainBonus`). Filling any of these live-multiplies them into
  "Total Mult (as shown in game)" (`js/app.js onMultBreakdownInput`) instead
  of the player doing that multiplication by hand every time a factor
  changes. Leaving the breakdown untouched leaves "Total Mult" exactly as
  typed -- the write-back only fires from a real edit inside the details
  panel, never on page load, so it can't clobber a manually-entered number.
  None of these factors are modeled further (NOTES/gaps.md #4/#5); they're
  read off the game as opaque numbers, same as Total Mult always was.
  Verified with a headless browser (Playwright CLI): filled Vessel/Plague/
  Sword King, watched Total Mult update live to the exact product, reloaded
  and confirmed it persisted, then typed over it directly without touching
  the breakdown and confirmed THAT survived a reload too (not recomputed
  back).

## 2026-07-20 (export/import backup)
- **"Export to file" / "Import from file"** buttons (top of the page, above
  "Current stats"): dump the full stats form + tree state + all scenarios to
  one downloadable `.json`, and restore from one. Extra insurance beyond the
  existing localStorage autosave (`persistForm`/`persist`), which only
  survives a normal reload — not clearing browser data, a different browser/
  profile, or moving to another computer. (`index.html` `.backup-bar`,
  `js/app.js` `exportBackup`/`applyImportedPayload`/`onImportFileChosen`.)
  Verified end-to-end with a headless browser (Playwright CLI, since the
  connected Chrome extension couldn't reach the local dev server this
  session): filled stats + a tree node, exported, changed a value, imported
  the file back, confirmed the original value returned and the on-page
  status line updated — no console errors at any step.

## 2026-07-20 (tree star view + all-13-node Rush)
- **Singularity Tree redesigned as a radial star view** matching the in-game
  layout (`js/treeViz.js buildTreeSvg`): all 13 nodes, click/Enter to open
  an inline ascension:level editor. Existing 6 nodes kept their old input
  ids so saved localStorage values carried over with no migration.
  (`index.html`, `js/app.js` `renderTreeViz`/`selectTreeNode`/`setupTreeViz`,
  `style.css`.)
- **All 13 tree nodes now enter `treeState`** (`readStatsForm`), not just the
  6 that feed a modeled formula — the other 7 (2.0, 4.1, 4.2, 5.1, 5.2, 7.1,
  7.2) are recorded for future use and Rush-node targeting even though they
  don't change any calculation yet (NOTES/gaps.md).
- **"Rush a tree node" now covers all 13 nodes**, not just 1.0/3.1/3.2.
  STN 1.0/3.1/3.2 are unchanged (confirmed cost, full editable scenario).
  The other 10 default to an estimated cost formula (NOTES/gaps.md #7,
  `tree.js STN_DEFINITIONS`), with an optional "cost shown in-game now"
  field that back-solves a real cost from one number the player reads off
  the game (`tree.js backsolveBaseCostLog10`) instead of the estimate.
  Rushing one of these 10 reports a time estimate only, not a scenario card
  (the scenario replay engine doesn't know a non-standard node purchase —
  see [architecture.md](architecture.md)). New local Dijkstra edge
  `upgradeTarget` in `js/nodeRush.js`; `tree.js nextUpgradeCost` gained an
  optional `baseCostOverrideLog10` 4th argument.
- **"+1/+5/+10/+15/+20" quick-fill buttons** in the Rush panel: read the
  selected node's current ascension:level straight off the tree star and
  fill Target ascension/level with the state N purchases from now
  (`tree.js advanceByBuys`, mirrors `searchCore.js upgrade()`'s auto-ascend
  wrap exactly), instead of requiring the player to do that math by hand.

## 2026-07-20 (notes-only pass)
- Re-checked all remaining STN upgrade-cost sources for the 10 nodes without
  a confirmed cost (gaps.md #7): re-read every formula cell in the community
  spreadsheet's "Time optimizer" sheet (its "tree node X time cost" cells are
  seconds-saved, not atoms-spent — confirmed dead end) and ran a wiki
  full-text search for "Singularity Tree"/"Tree Node"/"STN" (zero hits; the
  wiki's node cost tables are for Refine Nodes, a different currency).
  Documented the tree's full 13-node layout (`1 — 2 — {3.1,3.2} — {4.1,4.2}
  — {5.1,5.2} — {6.1,6.2} — {7.1,7.2} — 8`) from the in-game tree screenshot,
  and added an explicitly-labeled linear-per-tier cost *guess* (fit through
  the 3 confirmed base costs) for the other 10 nodes — not wired into any
  code, documentation only. See [model.md](model.md), [gaps.md](gaps.md),
  [community-spreadsheet.md](community-spreadsheet.md).

## 2026-07-20
- **RN126/127/128/131 changed from owned/not-owned checkboxes to leveled
  0-10 inputs**, each with a "maxed" checkbox (so you don't need to know the
  node's true in-game max level — check it once it's fully upgraded).
  Formulas corrected per the community spreadsheet — see
  [community-spreadsheet.md](community-spreadsheet.md) and
  [model.md](model.md). (`index.html`, `js/app.js readStatsForm` /
  `readRnLevel`, `js/atomPenalties.js rn126Exponent`/`rn127Exponent`/
  `rn128Exponent`/`rn131Factor`.)
- **RN136 added** (optional, defaults to level 0/unowned): adds to the Local
  Speed exponent. (`index.html`, `js/app.js`, `js/tooltips.js`.)
- **"Clear All Plans" button** — deletes every saved scenario in one click
  (with a confirm dialog), instead of deleting them one at a time.
  (`index.html`, `js/app.js clearAllScenarios`.)
- **Node-rush planner added**: "Rush a tree node" panel — fastest path to
  bring STN 1.0/3.1/3.2 to a target ascension:level, optionally buying the
  other two nodes or grinding Sings along the way if that's faster.
  New file `js/nodeRush.js` (`findNodeRushPath`); worker `mode: "rush-node"`;
  UI panel + `onRushNode` in `js/app.js`. See [architecture.md](architecture.md).
- **Code split**: `pathSearch.js` (1170 lines) split into `searchCore.js`
  (shared Dijkstra/beam engine + replay dispatcher), `pushPlanner.js` (push-
  target planner), `nodeRush.js` (single-node rush), and a slimmed-down
  `pathSearch.js` (mult-goal planner, re-exporting the other two). `app.js`
  (1376 lines) split off `renderHelpers.js` (pure HTML-string helpers: cell
  builders, the exponent chart/table, action labels). See
  [architecture.md](architecture.md) for the resulting module map.
- **NOTES.md split into NOTES/ directory** (this file included) — a single
  204-line file was getting unwieldy as more sources got added.

## 2026-07-15
- Collapsed consecutive identical steps into one row (`Sing ×N`) with
  `+`/`×`/`×all` controls in the scenario table (`app.js renderScenarioCard`).
- Multi-target Final Push planner added: "Push targets" field (comma
  separated exponents), "Find Push Path (3 variants)" button → optimal /
  extra tree / sings only. Each push = grind to 10^x with tree-weakened
  penalties, then Singularize. (`pathSearch.js findPushPathVariants` at the
  time — later moved to `pushPlanner.js`, see 2026-07-20; worker
  `mode: "push"`.)
- STN 6.2 added to the form as fixed config; weakens the 1e1000 penalty in
  every projection (`buildBaseOverrides` in `app.js` + worker).
- "Rank tree for push" feature added: ranks a hypothetical +1 level on each
  tree node by push time saved (`rankPushTreeUpgrades`).
- Initial site mirror: downloaded from
  `https://mastermindgolem.github.io/revidle-web/` (no public source repo;
  the deployed site is unminified ES modules, so the download IS the source).
