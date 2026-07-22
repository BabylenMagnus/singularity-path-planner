# Revidle Singularity Planner — Notes Index

Everything we know (and don't know) about Revolution Idle's Singularity layer,
as modeled by this planner, plus a log of local code changes. The public wiki
is WORK IN PROGRESS and has no formulas; the model comes from the original
tool author's reverse-engineering (`singularity_sim` Python project, ported
to JS), a community spreadsheet ("Singularity Time Spender V1.1"), and data
we collect from the game ourselves.

**When you learn a new number from the game, add it to the relevant file
below and wire it into the code.**

- [model.md](model.md) — the formulas as implemented: atom growth, penalties,
  tree node effects, Singularize, upgrade costs. Read this before touching
  any math in `js/searchCore.js`, `js/singularize.js`, or `js/atomPenalties.js`.
- [wiki-tables.md](wiki-tables.md) — Singularity/Atom milestone tables and
  Refine Node summaries pulled from the official (WIP) wiki.
- [community-spreadsheet.md](community-spreadsheet.md) — formulas
  cross-checked against the community "Singularity Time Spender V1.1"
  spreadsheet: what matched our model exactly, what corrected it (RN126-136
  are leveled, not toggles), and what's still open (STN8 × Local Speed).
- [gaps.md](gaps.md) — mechanics NOT modeled yet, and the checklist of what
  to bring back from the game to close each gap.
- [architecture.md](architecture.md) — how the JS is split into modules and
  why, so a new planner mode goes in the right file.
- [changelog.md](changelog.md) — dated log of local feature/model changes.

## Sources checked 2026-07-15 → 2026-07-20
- https://revolutionidle.wiki.gg/wiki/Singularity (WIP; milestone tables only)
- https://revolutionidle.wiki.gg/wiki/Minerals/Refine_Tree (RN126+ undocumented, "max = ?")
- Steam community: "Figuring out the math in this game is a lost cause" —
  undocumented softcaps; do not trust guides, verify in-game.
- User's copy of the community spreadsheet "Singularity Time Spender V1.1"
  (`.xlsx`, two sheets: "Time optimizer", "Sheet1") — see community-spreadsheet.md.
- In-game screenshots (Singularize panel, Buff & Penalties, Milestones tab).
