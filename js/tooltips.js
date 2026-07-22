// Info-icon tooltip copy for the stats form, keyed by the id of the input
// each tooltip sits next to. Edit the text here -- applyTooltips() (called
// from app.js on init) reads this file and fills in every
// `.info-icon[data-tooltip-key]` in index.html at load time.
export const TOOLTIPS = {
  "current-mult":
    "Your current Singularity Mult. Shown as Mult x[number]",
  "total-mult-shown":
    "Read-only -- computed automatically as the product of the factors below. Matches the Total x[number] shown in-game once every factor is filled in.",
  "goal-mult":
    "The Singularity Mult you want to get to.",
  "compare-goal":
    "Optional: Compare the time to get to goal if you went directly for it vs went for a further out goal.",
  "tarot-local-speed":
    "Your Tarot Local Speed stat. This is from the Tarots page.",
  "relic69-value":
    "Relic 69's buff amount or level from the Relics page.",
  "mult-bonuses":
    "WIP.",
  "mult-breakdown":
    "Same idea as the game's Effects tab or the community spreadsheet: instead of multiplying these by hand, enter each factor as its own number (1 or blank = doesn't apply / not unlocked yet). Total Mult above is computed automatically as their product -- it's read-only, there's no separate place to type a flat number anymore. None of these individual factors are modeled further (see NOTES/gaps.md #4/#5) -- they're read off the game as opaque numbers, same as Total Mult itself always was. STN 1.0's own tree bonus is NOT in this list -- that's computed automatically from the tree above, don't double-count it here. Sword/Wand/Pentacle/Cups King Complete each multiply by 1.35 when checked (from the community spreadsheet's formula).",
  "push-exponent":
    "Atom requirement of each next Singularity count, as powers of 10, comma-separated (e.g. '1020, 1040, 1060' for Singularity #53, #54, #55). Used by 'Find Push Path' and 'Rank tree for push': each segment is normal Sings + tree upgrades ending in one long grind to that target (the push Singularizes too). Copy the requirements the game shows. All must be above 308.",
  "rank-tree-push":
    "For each Singularity Tree node (1.0, 3.1, 3.2, 6.1, 6.2, 8), pretends you buy +1 level and re-times your push targets. Ranks nodes by time saved. Does not include the cost of buying the upgrade — only how much faster the push becomes afterward.",
  "rush-node":
    "Fastest way to bring ONE node to a target ascension:level. STN 1.0, 3.1, and 3.2 have a confirmed purchase-cost formula; the other 10 use an estimated formula (NOTES/gaps.md #7) unless you fill in 'Cost shown in-game now' below — enter the upgrade cost the game shows for that node right now and the estimate is replaced with a back-solved real value for this search. The search may buy the standard nodes (1.0/3.1/3.2) along the way, or grind Sings (raises mult, speeds every later purchase), if that's faster overall. Rushing one of the 10 estimated-cost nodes shows a time estimate only — it doesn't create an editable scenario card, since the scenario editor doesn't know how to replay a non-standard node purchase yet. Deep targets (many ascensions out) can hit the search iteration cap — raise 'Max search iterations' in Advanced if the result looks capped.",
  "rush-cost-shown":
    "Optional. The upgrade cost this node shows in-game RIGHT NOW (as a power of 10, e.g. 480 for 1e480), at its current ascension:level from the tree above. Back-solves the node's base cost formula from that one real number instead of using the tier-based estimate (NOTES/gaps.md #7). Leave blank to use the estimate.",
  "regenerate-cost-guesses":
    "Re-derives the 'Next level cost' estimate for every node you HAVEN'T corrected yet, using the current confirmed values (built-in + whatever you've typed into other nodes' cost fields) via nearest-known-tier extrapolation (NOTES/gaps.md #7). Run this after correcting one or more nodes so the still-unconfirmed ones' guesses update to match -- it never touches a node you've already corrected.",
  "tree-viz":
    "Click any star to enter its ascension:level. Layout and connections match the in-game Singularity Tree: 1 — 2 — {3.1,3.2} — {4.1,4.2} — {5.1,5.2} — {6.1,6.2} — {7.1,7.2} — 8. Nodes 2.0, 4.1, 4.2, 5.1, 5.2, 7.1, 7.2 don't have a confirmed game effect wired into this planner yet (see NOTES/gaps.md) — entering them here future-proofs your record of the tree and lets 'Rush a tree node' target them once their cost is known, but they won't change any calculation until their effect is confirmed.",
  "n1-level":
    "Singularity Tree Node 1. Singularity Tree Mult Factor *x",
  "n2-level":
    "Singularity Tree Node 2. Effect formula only (ascension^0.70 term, NODE_EFFECT_PARAMS) — no confirmed game effect wired into this planner yet.",
  "s31-level":
    "Singularity Tree Node 3.1. e308 Atom Penalty /x",
  "s32-level":
    "Singularity Tree Node 3.2. e500 Atom Penalty /x",
  "s41-level":
    "Singularity Tree Node 4.1. Effect formula only — no confirmed game effect wired into this planner yet.",
  "s42-level":
    "Singularity Tree Node 4.2. Effect formula only — no confirmed game effect wired into this planner yet.",
  "s51-level":
    "Singularity Tree Node 5.1. Effect formula only — no confirmed game effect wired into this planner yet.",
  "s52-level":
    "Singularity Tree Node 5.2. Effect formula only — no confirmed game effect wired into this planner yet.",
  "s61-level":
    "Singularity Tree Node 6.1. Next Singularity Mult Decay /x",
  "s62-level":
    "Singularity Tree Node 6.2. e1000 Atom Penalty /x. Matters a lot for pushes past 1e1000 Atoms.",
  "s71-level":
    "Singularity Tree Node 7.1. Effect formula only — a candidate for weakening the e2000+ penalties, unconfirmed (see NOTES/gaps.md #6).",
  "s72-level":
    "Singularity Tree Node 7.2. Effect formula only — no confirmed game effect wired into this planner yet.",
  "s8-level":
    "Singularity Tree Node 8. STN 1 to 7.2 Effect *x",
  rn126:
    "RN126 level (0-10). Weakens the 1e50 Atom penalty: exponent = 1 − (1−level)/6 — fully removed once maxed. Check 'maxed' if you don't know the exact level.",
  rn127:
    "RN127 level (0-10). Weakens the 1e154 Atom penalty: exponent = 1 − 0.153×(1−level) — fully removed once maxed.",
  rn128:
    "RN128 level (0-10). Weakens the 1e10 Atom penalty: exponent = 0.5 + 0.05×level — fully removed at level 10.",
  rn131:
    "RN131 level (0-1 -- its real in-game max, unlike RN126/127/128/136's 0-10). Atom Gain buff scaled by level and Singularity Count: factor = 1 + 0.005 × count × level. Confirmed against three independent community-spreadsheet exports (2026-07-21): every one showed level 1 as maxed. Checking 'maxed' with the wrong cap here previously inflated this buff ~3.3x for anyone at level 1 (treated as if it were 10).",
  rn136:
    "RN136 level (0-10, optional). Adds to the Local Speed exponent: Local Speed = Tarot Local Speed ^ (0.05 + 0.02×level). Leave at 0 if you don't have this node yet.",
  "singularity-count":
    "Your Singularity Count.",
  "max-iterations":
    "Caps how many candidate steps the path-finding search explores before returning its best answer. Higher can find better paths but takes longer.",
  "exp-from":
    "Starting Atom count, as a power of 10 (e.g. 0 means e^0 = 1 Atom).",
  "exp-to":
    "Target Atom count, as a power of 10 (e.g. 308 means e^308 Atoms).",
  "shop-local-speed-level":
    "Level (0-10) of the shop's Singularity Local Speed purchase. Each level adds 2% to Local Speed.",
  "shop-mult-gain-level":
    "Level (0-10) of the shop's Singularity Mult Gain purchase. Each level adds 2.5% to the Mult gained per Singularize.",
};

export function applyTooltips(root = document) {
  root.querySelectorAll(".info-icon[data-tooltip-key]").forEach((el) => {
    const text = TOOLTIPS[el.dataset.tooltipKey];
    if (text) el.dataset.tooltip = text;
    else console.warn(`no tooltip text for key "${el.dataset.tooltipKey}"`);
  });
}
