# Known gaps — not modeled yet

Each of these needs in-game data (or a matching spreadsheet formula) before
it can be wired into the code. Cross-reference: [model.md](model.md) for
what IS modeled, [community-spreadsheet.md](community-spreadsheet.md) for a
second source that has the *same* gaps in a couple of places.

1. **Singularity count requirement growth** (Event Horizon Tax, 10+): formula
   unknown anywhere (wiki, spreadsheet, community). Known data points:
   - #53 → 1e1020 Atoms (user screenshot, 2026-07-15: "Progress to
     Singularity 61.901% · 24.6e630 / 1.00e1,020")
   - #54 → ? #55 → ? ... **record after every Singularity.**
   Workaround: the planner takes the requirement list as manual input (the
   "Push targets" field, comma-separated exponents) rather than deriving it.

2. **Loop Feeds Loop (Singularity #20+)**: Singularity Count acts as a
   factor for the next Singularity Mult — not in our mult-gain formula.
   Need Effects-tab values at a few different counts to fit the formula.

3. **Self Synergism (Singularity #64)**: Sing Mult feeds next Sing Mult —
   this is the user's actual end goal for the current push project. Model
   once reached and the mechanic's exact numbers are visible in-game.

4. **Atom Overflow (e308+): atoms act as an additional Singularity Mult
   Factor.** This means a push deep past e308 yields a MUCH larger mult
   gain than the model currently predicts — `multGainFromSingularize` in
   `singularize.js` doesn't include an atoms term at all right now. Evidence
   this matters: at 2.46e631 atoms, back-solving the in-game mult gain
   (+0.2882) implied an effective Total Mult of 3.2995 vs the 2.9593 the
   player had entered at low atoms — roughly ×1.115 extra from atoms alone
   at that exponent. The community spreadsheet has the same gap (its
   "Atoms" Total Mult factor defaults to 1/"optimal", i.e. unmodeled).
   **Need**: Effects tab "Atoms" factor value at several atom counts (e308,
   e500, e1000, e2000, and ideally right before a push completes) to fit a
   curve. This is the single biggest known accuracy gap for anyone doing
   deep pushes (10^1000+), since the model currently *undercounts* the mult
   gained by a push.

5. **SMS Factor, RN122/RN125 factors** — unmodeled Singularity Mult factors.
   The "Total Mult as shown" input absorbs them, but only at their CURRENT
   (start-of-plan) values — if any of them scale during a long push (e.g.
   RN122 scales with Singularity Count, which stays fixed since pushes don't
   increment the visible count until the push completes), the model may
   drift over a very long single push. Low priority — likely a small effect
   compared to gap #4.

6. **e2000+ penalty weakening** — which tree nodes (7.1/7.2? something else
   entirely?) weaken the e2000/e3000/e5000/e10000 penalties, if any. Both
   the wiki and the community spreadsheet treat these as flat, unweakened
   exponents (0.5, 1/3, 0.2, 0.1) — possibly they really are flat and there
   is no weakening node, in which case this "gap" is actually just correct
   as-is. Needs an in-game report from someone who's leveled past e1000 with
   a maxed tree, to see if the penalty stays exactly at the flat exponent.

7. **STN 2.0/4.1/4.2/5.1/5.2/6.1/6.2/7.1/7.2/8.0 upgrade costs** — needed so
   the optimizer (and the node-rush planner, [architecture.md](architecture.md))
   can plan buying them instead of treating them as fixed config the user
   enters once. Confirmed dead ends, checked 2026-07-20:
   - **Community spreadsheet**: no cost model at all — its "tree node X time
     cost" cells (`Time optimizer!D35/D62/D89/D116/D251`) sum *seconds saved*
     from a hypothetical +1 ascend, not atoms spent. It's a stats-in/time-out
     calculator, not a path search — nothing to read a cost formula off of.
   - **Wiki**: zero hits for Singularity Tree Node cost data anywhere,
     including a full-text search ("Singularity Tree", "Tree Node", "STN").
     The wiki's cost tables that DO exist are for **Refine Nodes** (RN121-136,
     priced in RfP — a different currency/system from STN atom costs) — do
     not confuse the two when reading wiki pages that mention both.
   - Only 1.0 (e300), 3.1 (e420), 3.2 (e420) are confirmed, via
     `singularity_sim`'s reverse-engineering (the tool this planner was
     ported from), not an independent second source.

   **Unconfirmed extrapolation, now wired in as a default (2026-07-20)**: the
   three known base costs line up with the nodes' position in the tree's
   linear chain (1 → 2 → {3.1,3.2} → {4.1,4.2} → {5.1,5.2} → {6.1,6.2} →
   {7.1,7.2} → 8, confirmed against the in-game tree screenshot) if cost
   depends only on tier, not on a node's (a,p,b) effect params — note 3.1 and
   3.2 have different params (0.6 vs 0.7 exponent) but the *same* e420 base
   cost, which supports a tier-only cost model. Tier 1 (node 1.0) = e300,
   tier 3 (nodes 3.1/3.2) = e420 → +120 over 2 tiers = +60/tier if linear:

   | Tier | Node(s) | Base cost |
   |---|---|---|
   | 1 | 1.0 | e300 (confirmed) |
   | 2 | 2.0 | **e427 (confirmed 2026-07-22)** |
   | 3 | 3.1, 3.2 | e420 (confirmed) |
   | 4 | 4.1 | **e417 (confirmed 2026-07-22)** |
   | 4 | 4.2 | **e475 (confirmed 2026-07-22)** |
   | 5 | 5.1 | **e590 (confirmed 2026-07-22)** |
   | 5 | 5.2 | e590 (guess -- see method below) |
   | 6 | 6.1, 6.2 | e734 (guess) |
   | 7 | 7.1, 7.2 | e878 (guess) |
   | 8 | 8.0 | e1022 (guess) |

   **The original linear-per-tier guess is DISPROVEN, not just unvalidated.**
   Four real in-game readings confirmed 2026-07-22:
   - Node 2.0 (tier 2): ascension 6, level 4 → next cost 1.00e567 atoms →
     backsolved `baseAtomCost = 567 − 35×4 = e427` (old guess: e360).
   - Node 4.1 (tier 4): ascension 8, level 7 → next cost 1.00e732 atoms →
     backsolved `baseAtomCost = 732 − 45×7 = e417` (old guess: e480).
   - Node 4.2 (tier 4): ascension 3, level 1 → next cost 1.00e495 atoms →
     backsolved `baseAtomCost = 495 − 20×1 = e475` (old guess: e480 -- close
     by luck, its tier-mate 4.1 landing 63 away shows this wasn't the method
     working, just coincidence).
   - Node 5.1 (tier 5): ascension 1, level 7 → next cost 1.00e660 atoms →
     backsolved `baseAtomCost = 660 − 10×7 = e590` (old guess: e540).

   A linear fit through only 1.0/3.1/3.2, by construction, is always *between*
   its two anchor points (e300, e420) — it can never predict tier 2 ABOVE
   e420 (real: e427) or tier 4 BELOW e420 (real: e417), and it can't predict
   two tier-mates (4.1 e417 vs 4.2 e475) differing by more than its own
   tier-to-tier step (60). Confirms cost doesn't track tier position
   monotonically or uniformly at all.

   **New method for the remaining unconfirmed nodes (5.2/6.1/6.2/7.1/7.2/8.0),
   2026-07-22**: nearest-known extrapolation instead of one global line --
   each guess is the last confirmed tier's value, plus a step recomputed from
   the two MOST RECENT confirmed tiers (tier 4 avg `(417+475)/2 = 446` → tier
   5's confirmed 590 is a `+144` step), carried forward one tier at a time
   (590 → 734 → 878 → 1022), and a same-tier sibling with no reading of its
   own (5.2) borrows its confirmed tier-mate's value (5.1's e590) rather than
   a stale global guess. Still **low-confidence placeholders, not "probably
   close" estimates** — the four real points above show the underlying cost
   mechanic isn't understood, only re-fit closer to what's actually been
   seen; no two nodes' costs can be assumed to match just because they share
   a tier, and the "+144/tier" step itself could easily be wrong past tier 5
   since it's extrapolated from a single tier-to-tier jump. `tree.js
   STN_DEFINITIONS` still carries this table as the DEFAULT the "Rush a tree
   node" panel and each tree-editor-panel's own "Next level cost" field fall
   back to when no real number has been entered for that node; entering one
   (either place) back-solves and uses a real `baseAtomCost` instead
   (`tree.js backsolveBaseCostLog10`) — the table stops being consulted for
   that node the moment you do. Needs: next-upgrade cost shown in-game for
   5.2, 6.1, 6.2, 7.1, 7.2, and 8.0 at any known ascension:level, entered
   directly into that node's own field in the tree star editor (auto-persists)
   rather than edited into this table by hand.

8. **Singular Zodiacs at e1000+** — a side reward that appears during pushes
   past the Horoscope of the Void atom milestone. Value/effect unknown; the
   Singularize panel shows "+0 zodiacs" below e1000 and presumably a
   non-zero count above it (unconfirmed — no screenshot yet above e1000).

9. **STN 8 × Local Speed** (added 2026-07-20, from the community
   spreadsheet): their Local Speed formula multiplies by the STN 8 effect a
   THIRD time (once via each node's own effect already being ×STN8, once
   directly on Local Speed). Not applied to our code — could be a bug in
   their sheet, or a real mechanic we're missing. Needs in-game
   confirmation: with STN 8 owned and non-trivial, does raising *only* STN 8
   change your displayed Local Speed number, separately from any node it's
   boosting?

## Data collection checklist (что записывать из игры)

- [ ] Требование каждой следующей Singularity (#53=e1020, #54=?, ... #64=?)
- [ ] STN 6.2: точный текст эффекта, ascension:level, стоимость следующего уровня
- [ ] Стоимости следующих уровней STN 2.0, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2, 7.1,
      7.2, 8.0 (см. #7 — сейчас только линейная экстраполяция-ДОГАДКА по
      тиру, нужна хотя бы одна реальная цифра для проверки)
- [ ] Скрин вкладки Effects (все Singularity Mult Factors) — сейчас,
      и во время пуша на ~e500 / ~e1000 / ~e2000 атомов (для gap #4)
- [ ] Прогноз прироста mult перед сингуляризацией при разных атомах
      (e308 / e1000 / перед e2000) — тоже для gap #4
- [ ] Точные экспоненты штрафов за e1000 / e2000 / e3000 / e5000 из игры
- [ ] Есть ли узел, ослабляющий e2000+ (gap #6)?
- [ ] Меняется ли Local Speed при прокачке ТОЛЬКО STN 8, без других узлов (gap #9)?
- [ ] RN126/127/128/131/136: точные уровни (не просто "куплен/не куплен")
- [ ] Shop: точные проценты и макс. уровни Local Speed / Mult Gain
- [ ] Контрольный замер: реальное время роста e400→e500 при известном mult
      (сверить с вкладкой Time to Exponent)
