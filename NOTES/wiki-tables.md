# Wiki-verified tables

Fetched 2026-07-15 from https://revolutionidle.wiki.gg/wiki/Singularity
(the page is marked WORK IN PROGRESS; no formulas, milestone tables only).

## Singularity Milestones
| Count | Name | Reward |
|---|---|---|
| 1 | First Collapse | Unlock Milestones; SMS Factor locked at 0 |
| 2 | Accelerated Growth | Unlock Effects Tab |
| 3 | Event Horizon | Keep Plague on reset; Plague Generator Awards no longer decrease |
| 5 | Spaghettification | Unlocks Tree Tab |
| 8 | Beyond Time | Keep Artifacts on reset |
| 10 | Event Horizon Tax | **Atom Requirement for the next Singularity starts increasing** |
| 16 | The Unforgotten | Keep Elements, Minerals and Tarot on reset |
| 20 | Loop Feeds Loop | **Singularity Count acts as a factor for the next Singularity Mult** |
| 32 | Astral Property | Unlocks Houses Tab |
| 64 | Self Synergism | **Singularity Mult acts as a factor for the next Singularity Mult** |
| 100 | One Hundred | ? (wiki empty) |
| 128 | COMING SOON | — |

Event Horizon Tax's exact in-game text (confirmed via user screenshot,
2026-07-15): "The Atom requirement for the next Singularity starts
increasing. You can still trigger a Singularity at 1.8e308 Atoms to gain
Singularity Mult, but your **Singularity Count will not increase**." — so
normal Sings stay available at 1.8e308 forever; only *count*-incrementing
Sings need the growing requirement. This is exactly the distinction our
push planner models (`grind` = uncounted 1e308 Sing, `final_push` = the
counted Sing at the growing requirement).

## Atom Milestones (rewards, separate from the atom-gain penalties in model.md)
| Atoms | Name | Reward |
|---|---|---|
| 1e3 | First Thousand | Sacrifice Dust Gain ^1.1 |
| 1e9 | Quantum Dust | Black Gem Efficiency ^1.1 |
| 1e16 | Atomic Flow | Element Factors 1 and 2 powers ×3 |
| 1e25 | Nuclear Bloom | Last element node upgrade costs ÷1e300 |
| 1e75 | Matter Collapse | Auto-Highest Plague Stage |
| 1e225 | Quantum Pressure | SMP Exp Requirements ^0.75 |
| 1e308 | Atom Overflow | **Atoms unlocked as a Singularity Mult Factor** (not modeled — [gaps.md](gaps.md) #4) |
| 1e1000 | Horoscope of the Void | **Singular Zodiacs obtainable** (needs Houses tab, unlocked at Singularity #32) |
| 1e2700 | Universe Under Pressure | Atoms past e1000 boost Luck |
| 1e6000 / 1e10000 | COMING SOON | — |

## Refine Nodes (top tier; RN126+ undocumented on the wiki itself)
- RN121: Unlocks Singularity
- RN122: Singularity Effect (based on count) boosts Spread Speed
- RN125 (1e4900 RfP): RN125 as a Singularity Mult Factor
- RN126 / RN127 / RN128 / RN131 / RN136: leveled 0-10, formulas from the
  community spreadsheet — see [model.md](model.md) and
  [community-spreadsheet.md](community-spreadsheet.md) (wiki has zero data
  on these; every number here came from the spreadsheet or in-game testing).
