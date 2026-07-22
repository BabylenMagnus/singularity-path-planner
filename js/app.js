import { LogNum } from "./bignum.js?v=20260722b";
import {
  relic69LevelBonus, baseExponent,
  rn126Exponent, rn127Exponent, rn128Exponent, rn131Factor,
  E10_PENALTY_NAME, E50_PENALTY_NAME, E154_PENALTY_NAME,
} from "./atomPenalties.js?v=20260722b";
import { formatDuration, estimateTimeToNextSingularity } from "./growth.js?v=20260722b";
import { totalMult, nodeEffect, stn8Multiplier, weakenedPenaltyExponent } from "./singularize.js?v=20260722b";
import { replayActionsPartial, E308_PENALTY_NAME, E500_PENALTY_NAME, E1000_PENALTY_NAME } from "./pathSearch.js?v=20260722b";
import { applyTooltips } from "./tooltips.js?v=20260722b";
import { buildTreeSvg, TREE_NODE_IDS, NODE_INPUT_PREFIX } from "./treeViz.js?v=20260722b";
import {
  hasConfirmedCost, backsolveBaseCostLog10, nextUpgradeCost, advanceByBuys,
  defaultBaseAtomCostLog10, regenerateCostGuesses,
} from "./tree.js?v=20260722b";
import {
  actionLabel, isGrindAction, escapeHtml, actionOptionsHtml, stnCell, multCell,
  NODE_KEYS, buildThresholdList, buildExponentChart,
} from "./renderHelpers.js?v=20260722b";

const STORAGE_KEY = "revidle-planner-scenarios-v2";

/** @type {Array<object>} */
let scenarios = [];
// At most two scenarios are ever shown in full detail side by side --
// these hold the ids assigned to each pane (or null if empty).
let compareSlots = { a: null, b: null };

const el = (id) => document.getElementById(id);
const statusEl = () => el("status");

// Read a "level (0-N)" + "maxed" checkbox pair. The checkbox exists so you
// don't have to know/enter the node's exact in-game max level -- check it
// once it's fully upgraded and forget the number. maxLevel defaults to 10
// (RN126/127/128/136) but RN131's real in-game cap is 1, confirmed against
// three independent community-spreadsheet exports (2026-07-21) -- treating
// its "maxed" checkbox as 10 (the mistake made when this pattern was first
// copied to all four RN fields) inflated its Atom Gain buff ~3.3x too high.
function readRnLevel(levelId, maxedId, maxLevel = 10) {
  const int = (id) => parseInt(el(id).value, 10) || 0;
  return el(maxedId).checked ? maxLevel : int(levelId);
}

// --- Total Mult breakdown ------------------------------------------------
// Same shape as the game's Effects tab / the community spreadsheet's config
// block (NOTES/community-spreadsheet.md): rather than multiplying these by
// hand into one number, enter each factor separately (1 or blank = doesn't
// apply) and this multiplies them into "Total Mult (as shown in game)" live.
// None of these factors are modeled further -- see NOTES/gaps.md #4/#5 --
// they're opaque numbers read off the game, same as Total Mult always was.
// STN 1.0's own tree bonus is deliberately NOT here; it's already computed
// from the tree star above.
const MULT_BREAKDOWN_NUMERIC_IDS = [
  "mb-vessel", "mb-plague", "mb-relic38", "mb-relic67", "mb-atoms",
  "mb-sing-count-factor", "mb-rn125", "mb-zodiacs", "mb-smf",
];
const MULT_BREAKDOWN_KING_IDS = ["mb-sword-king", "mb-wand-king", "mb-pentacle-king", "mb-cups-king"];

function numOr1(id) {
  const raw = el(id).value.trim();
  if (raw === "") return 1;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 1;
}

function computeMultBreakdownProduct() {
  let product = 1;
  for (const id of MULT_BREAKDOWN_NUMERIC_IDS) product *= numOr1(id);
  for (const id of MULT_BREAKDOWN_KING_IDS) if (el(id).checked) product *= 1.35;
  return product;
}

function formatMultBreakdownProduct(x) {
  if (!Number.isFinite(x)) return "—";
  return x.toPrecision(6).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

// Fires on any input/change inside #mult-breakdown (one delegated listener
// covers all 13 factor controls). "Total Mult" itself is a read-only display
// -- this is the only thing that ever writes to it.
function onMultBreakdownInput() {
  const product = computeMultBreakdownProduct();
  el("total-mult-shown").value = formatMultBreakdownProduct(product);
  persistForm();
}

function readStatsForm() {
  const num = (id) => parseFloat(el(id).value);
  const int = (id) => parseInt(el(id).value, 10) || 0;

  // RN126/127/128/131/136 are leveled 0-10 Refine Nodes, not simple owned/not
  // toggles (confirmed against the community "Singularity Time Spender"
  // spreadsheet). Their formulas live in atomPenalties.js.
  const rn126Level = readRnLevel("rn126-level", "rn126-maxed");
  const rn127Level = readRnLevel("rn127-level", "rn127-maxed");
  const rn128Level = readRnLevel("rn128-level", "rn128-maxed");
  const rn131Level = readRnLevel("rn131-level", "rn131-maxed", 1);
  const rn136Level = readRnLevel("rn136-level", "rn136-maxed");

  const staticFactors = [rn131Factor(int("singularity-count"), rn131Level)];

  // All 13 tree nodes are captured here (see NOTES/model.md "Layout"), but
  // only 1.0/3.1/3.2/6.1/6.2/8.0 feed a modeled formula below -- the other
  // 7 (2.0, 4.1, 4.2, 5.1, 5.2, 7.1, 7.2) have no confirmed game effect yet
  // (NOTES/gaps.md) and are carried purely for record-keeping / future
  // Rush-node targeting.
  const treeState = {};
  for (const [nodeId, prefix] of Object.entries(NODE_INPUT_PREFIX)) {
    treeState[nodeId] = [int(`${prefix}-level`), int(`${prefix}-ascension`)];
  }

  // STN 8.0 ("STN 1 to 7.2 Effect *x") multiplies every other node's effect;
  // STN 6.1 divides the Singularize mult-decay exponent (1/2 -> 1/(2*stn61)).
  // Both are fixed config (the planner never buys them), so they're plain
  // scalars carried alongside.
  const [s8Level, s8Ascension] = treeState["8.0"];
  const stn8 = stn8Multiplier(s8Level, s8Ascension);
  const stn61 = nodeEffect("6.1", treeState["6.1"][0], treeState["6.1"][1]);

  // The user enters the Total Mult they SEE in game, which already includes
  // STN 1.0's bonus at its current (level, ascension) -- itself scaled by STN 8.
  // Recover the underlying total_mult_base by dividing both back out; as the
  // tree levels up over a path, the sim re-applies node1's (rising) bonus itself.
  const [n1Level, n1Ascension] = treeState["1.0"];
  const totalMultBase = num("total-mult-shown") / (nodeEffect("1.0", n1Level, n1Ascension) * stn8);

  return {
    startingMult: num("current-mult"),
    totalMultBase,
    goal: num("goal-mult"),
    compareGoal: el("compare-goal").value.trim() === "" ? null : num("compare-goal"),
    // User enters Tarot Local Speed (Tarots page); the sim's Local Speed
    // multiplier is that value raised to (0.05 + 0.02 * RN136 level), times
    // the "Singularity Local Speed" shop stat's flat bonus (2% per level).
    // The 0.02*RN136 term in the exponent is confirmed against the community
    // spreadsheet; RN136 defaults to 0 (unowned) if never touched.
    localSpeed: num("tarot-local-speed") ** (0.05 + 0.02 * rn136Level) * (1 + int("shop-local-speed-level") * 0.02),
    // "Singularity Mult Gain" shop stat: a flat multiplier on the Mult
    // gained per Singularize (2.5% per level, 0-10 levels).
    shopMultGainBonus: 1 + int("shop-mult-gain-level") * 0.025,
    // Relic 69's atom-gain buff. One box + a mode toggle: "buff" uses the number
    // as-is (its level->buff formula is suspect), "level" converts via
    // relic69LevelBonus. Either way it becomes the relic_69_bonus p-chain factor.
    relic69Bonus: readRelic69Bonus(),
    multBonuses: parseMultBonuses(el("mult-bonuses").value),
    // Final-push planner targets: the atom requirement (10^x) of each next
    // Singularity count, comma-separated (e.g. "1020, 1040, 1060").
    pushExponents: parsePushExponents(el("push-exponent").value),
    treeState,
    rn126Level, rn127Level, rn128Level,
    staticFactors,
    stn8,
    stn61,
    maxIterations: int("max-iterations") || 50_000,
  };
}

// Read the single Relic 69 box + mode toggle into a p-chain bonus factor
// (null = blank/ignore). "level" mode runs it through the (suspect) level
// formula; "buff" mode takes the number as the bonus directly.
function readRelic69Bonus() {
  const raw = el("relic69-value").value.trim();
  if (raw === "") return null;
  const v = parseFloat(raw);
  if (!Number.isFinite(v)) return null;
  return el("relic69-mode").value === "level" ? relic69LevelBonus(v) : v;
}

// Parse a "1020, 1040, 1060" push-target string into a sorted list of
// exponents; drops malformed entries.
function parsePushExponents(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => parseFloat(s.trim()))
    .filter((x) => Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);
}

// Parse a "36:1.15, 50:1.2" bonuses string into [[threshold, bonus], ...],
// sorted by threshold. Tarot-style Total Mult bonuses gated on current mult;
// silently drops any malformed or non-positive entry.
function parseMultBonuses(raw) {
  if (!raw) return [];
  const out = [];
  for (const chunk of raw.split(",")) {
    const [t, b] = chunk.split(":").map((s) => parseFloat(s.trim()));
    if (Number.isFinite(t) && Number.isFinite(b) && b > 0) out.push([t, b]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

function buildBaseOverrides(stats) {
  const overrides = {};
  if (stats.relic69Bonus !== null) overrides.relic_69_bonus = stats.relic69Bonus;
  const [s31Level, s31Ascension] = stats.treeState["3.1"];
  const [s32Level, s32Ascension] = stats.treeState["3.2"];
  const [s62Level, s62Ascension] = stats.treeState["6.2"] ?? [0, 0];
  overrides[E308_PENALTY_NAME] = weakenedPenaltyExponent(baseExponent(E308_PENALTY_NAME), "3.1", s31Level, s31Ascension, stats.stn8);
  overrides[E500_PENALTY_NAME] = weakenedPenaltyExponent(baseExponent(E500_PENALTY_NAME), "3.2", s32Level, s32Ascension, stats.stn8);
  overrides[E1000_PENALTY_NAME] = weakenedPenaltyExponent(baseExponent(E1000_PENALTY_NAME), "6.2", s62Level, s62Ascension, stats.stn8);
  overrides[E50_PENALTY_NAME] = rn126Exponent(stats.rn126Level ?? 0);
  overrides[E154_PENALTY_NAME] = rn127Exponent(stats.rn127Level ?? 0);
  overrides[E10_PENALTY_NAME] = rn128Exponent(stats.rn128Level ?? 0);
  return overrides;
}

// STN 6.1 / STN 8.0 levels live in the scenario's tree state (missing on
// scenarios saved before these nodes existed -> treated as unowned, effect 1).
function scenarioStn8(scenario) {
  const [lvl, asc] = scenario.initialTreeState["8.0"] ?? [0, 0];
  return stn8Multiplier(lvl, asc);
}
function scenarioStn61(scenario) {
  const [lvl, asc] = scenario.initialTreeState["6.1"] ?? [0, 0];
  return nodeEffect("6.1", lvl, asc);
}

function buildCtx(scenario) {
  // E308/E500 weakening is recomputed from the live tree state during replay
  // (3.1/3.2 are purchasable); E1000's is static config from STN 6.2, so it
  // lives in baseOverrides like relic 69.
  const stn8 = scenarioStn8(scenario);
  const [s62Level, s62Ascension] = scenario.initialTreeState["6.2"] ?? [0, 0];
  const baseOverrides = {
    [E1000_PENALTY_NAME]: weakenedPenaltyExponent(baseExponent(E1000_PENALTY_NAME), "6.2", s62Level, s62Ascension, stn8),
    [E50_PENALTY_NAME]: rn126Exponent(scenario.rn126Level ?? 0),
    [E154_PENALTY_NAME]: rn127Exponent(scenario.rn127Level ?? 0),
    [E10_PENALTY_NAME]: rn128Exponent(scenario.rn128Level ?? 0),
  };
  if (scenario.relic69Bonus != null) baseOverrides.relic_69_bonus = scenario.relic69Bonus;
  return {
    totalMultBase: scenario.totalMultBase,
    staticFactors: scenario.staticFactors,
    removedPenalties: new Set(scenario.removedPenalties),
    baseOverrides,
    localSpeed: scenario.localSpeed,
    baselineAtoms: LogNum.parse(scenario.currentAtoms),
    multBonuses: scenario.multBonuses ?? [],
    stn8: scenarioStn8(scenario),
    stn61: scenarioStn61(scenario),
    shopMultGainBonus: scenario.shopMultGainBonus ?? 1,
    pushExponents: scenario.pushExponents ?? (scenario.pushExponent != null ? [scenario.pushExponent] : []),
    projectionCache: new Map(),
    rushTarget: scenario.rushTarget,
  };
}

function buildStartState(scenario, ctx) {
  const n1 = scenario.initialTreeState["1.0"];
  const s31 = scenario.initialTreeState["3.1"];
  const s32 = scenario.initialTreeState["3.2"];
  const state = {
    n1Level: n1[0], n1Ascension: n1[1],
    s31Level: s31[0], s31Ascension: s31[1],
    s32Level: s32[0], s32Ascension: s32[1],
    mult: scenario.startingMult, atoms: ctx.baselineAtoms,
  };
  if (scenario.rushTarget) {
    const t = scenario.initialTreeState[scenario.rushTarget.stnId] ?? [0, 0];
    state.targetLevel = t[0];
    state.targetAscension = t[1];
  }
  return state;
}

// rushTarget: { stnId, costOverrideLog10 } for a scenario built from "Rush a
// tree node" on a non-standard node (2.0, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2, 7.1,
// 7.2, 8.0) -- undefined for every other scenario. Lets buildCtx/buildStartState
// track that one extra node's ascension:level through replay (searchCore.js
// upgradeGeneric), same as 1.0/3.1/3.2 do via their own dedicated fields.
function makeScenario(title, stats, actions, rushTarget = undefined) {
  return {
    id: crypto.randomUUID(),
    title,
    startingMult: stats.startingMult,
    totalMultBase: stats.totalMultBase,
    initialTreeState: stats.treeState,
    staticFactors: stats.staticFactors,
    rn126Level: stats.rn126Level ?? 0,
    rn127Level: stats.rn127Level ?? 0,
    rn128Level: stats.rn128Level ?? 0,
    relic69Bonus: stats.relic69Bonus,
    localSpeed: stats.localSpeed,
    shopMultGainBonus: stats.shopMultGainBonus,
    currentAtoms: "1",
    multBonuses: stats.multBonuses ?? [],
    pushExponents: stats.pushExponents ?? [],
    actions,
    ...(rushTarget ? { rushTarget } : {}),
  };
}

function setStatus(msg, isError = false) {
  const s = statusEl();
  s.textContent = msg;
  s.classList.toggle("error", isError);
}

const FORM_STORAGE_KEY = "revidle-planner-form-v1";

function formFields() {
  return document.querySelectorAll("#stats-form input, #stats-form select");
}

function persistForm() {
  try {
    const data = {};
    formFields().forEach((f) => {
      data[f.id] = f.type === "checkbox" ? f.checked : f.value;
    });
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("could not persist form", e);
  }
}

function loadForm() {
  try {
    const raw = localStorage.getItem(FORM_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    formFields().forEach((f) => {
      if (!(f.id in data)) return;
      if (f.type === "checkbox") f.checked = data[f.id];
      else f.value = data[f.id];
    });
  } catch (e) {
    console.warn("could not load saved form", e);
  }
}

// --- Singularity Tree star view -------------------------------------------
// Renders js/treeViz.js's SVG into #tree-viz-scroll and swaps which node's
// ascension/level inputs are visible below it. The inputs themselves are
// real, always-in-the-DOM elements (see index.html) with the same ids the
// old flat form used for the 6 pre-existing nodes, so loadForm()/persistForm()
// (which key purely off element id) needed zero changes for this feature.
let selectedTreeNode = null;

function readTreeStateForViz() {
  const state = {};
  for (const [nodeId, prefix] of Object.entries(NODE_INPUT_PREFIX)) {
    const level = parseInt(el(`${prefix}-level`)?.value, 10) || 0;
    const ascension = parseInt(el(`${prefix}-ascension`)?.value, 10) || 0;
    state[nodeId] = [level, ascension];
  }
  return state;
}

function renderTreeViz() {
  el("tree-viz-scroll").innerHTML = buildTreeSvg(readTreeStateForViz(), selectedTreeNode);
}

// One field per node shows the "next level cost" -- pre-filled with our own
// guess, editable in place. Editing it away from the guess IS the
// correction: no separate "estimate" + "your override" pair to fill in
// twice. The correction itself (a backsolved baseAtomCost) is persisted
// separately from the field's literal text (NODE_COST_OVERRIDES_KEY),
// because the field's displayed number must keep tracking the node's
// current ascension:level (nextUpgradeCost's whole point) while the
// correction underneath it stays fixed until edited again.
const NODE_COST_OVERRIDES_KEY = "revidle-planner-node-cost-overrides-v1";
let nodeCostOverrides = {}; // { [nodeId]: baseAtomCostLog10 } -- real player corrections

// Regenerated nearest-known-tier guesses (tree.js regenerateCostGuesses),
// for nodes with neither a confirmed default nor a player correction.
// Separate from nodeCostOverrides so "your correction" and "regenerated
// estimate" stay visually and logically distinct (a guess, however freshly
// recomputed, is not the same claim as a real in-game reading) -- see
// NOTES/gaps.md #7.
const NODE_COST_GUESSES_KEY = "revidle-planner-node-cost-guesses-v1";
let nodeCostGuesses = {};

function loadNodeCostOverrides() {
  try {
    const raw = localStorage.getItem(NODE_COST_OVERRIDES_KEY);
    nodeCostOverrides = raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn("could not load node cost overrides", e);
    nodeCostOverrides = {};
  }
  try {
    const raw = localStorage.getItem(NODE_COST_GUESSES_KEY);
    nodeCostGuesses = raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn("could not load node cost guesses", e);
    nodeCostGuesses = {};
  }
}

function persistNodeCostOverrides() {
  try {
    localStorage.setItem(NODE_COST_OVERRIDES_KEY, JSON.stringify(nodeCostOverrides));
  } catch (e) {
    console.warn("could not persist node cost overrides", e);
  }
}

function persistNodeCostGuesses() {
  try {
    localStorage.setItem(NODE_COST_GUESSES_KEY, JSON.stringify(nodeCostGuesses));
  } catch (e) {
    console.warn("could not persist node cost guesses", e);
  }
}

// What nextUpgradeCost's baseCostOverrideLog10 should be for this node right
// now: a real player correction wins, then a regenerated guess, then null
// (falls back to tree.js's own built-in default, confirmed or not).
function effectiveCostOverride(nodeId) {
  return nodeCostOverrides[nodeId] ?? nodeCostGuesses[nodeId] ?? null;
}

function nodeCostTag(nodeId) {
  if (nodeCostOverrides[nodeId] != null) return "your correction";
  if (hasConfirmedCost(nodeId)) return "confirmed";
  if (nodeCostGuesses[nodeId] != null) return "regenerated estimate";
  return "estimated — edit if wrong";
}

// Recompute one node's displayed "next level cost" from its current
// ascension:level and any stored correction/guess. Called whenever that
// node's ascension/level fields change (never from the cost field's own
// input -- see onNodeCostInput, which would otherwise fight the player
// mid-keystroke).
function refreshNodeCostField(nodeId) {
  const prefix = NODE_INPUT_PREFIX[nodeId];
  const input = el(`${prefix}-cost-shown`);
  const tagEl = el(`${prefix}-cost-tag`);
  if (!input) return;
  const level = parseInt(el(`${prefix}-level`)?.value, 10) || 0;
  const ascension = parseInt(el(`${prefix}-ascension`)?.value, 10) || 0;
  if (level >= 10) {
    input.value = "";
    if (tagEl) tagEl.textContent = "";
    return;
  }
  const cost = nextUpgradeCost(nodeId, level, ascension, effectiveCostOverride(nodeId));
  input.value = cost.log10.toFixed(1);
  if (tagEl) tagEl.textContent = `(${nodeCostTag(nodeId)})`;
}

// "Regenerate cost estimates" button: re-derive every UNCORRECTED node's
// guess from the nodes that ARE known right now (built-in confirmed
// defaults + every player correction so far), via tree.js's nearest-known-
// tier extrapolation. Never touches a node the player has already corrected
// (that's real data, not a guess to regenerate) -- see NOTES/gaps.md #7 for
// why a single global fit was replaced with this.
function onRegenerateCostGuesses() {
  const known = {};
  for (const nodeId of TREE_NODE_IDS) {
    if (nodeCostOverrides[nodeId] != null) known[nodeId] = nodeCostOverrides[nodeId];
    else if (hasConfirmedCost(nodeId)) known[nodeId] = defaultBaseAtomCostLog10(nodeId);
  }
  nodeCostGuesses = regenerateCostGuesses(known);
  persistNodeCostGuesses();
  renderNodeCostEstimates();
  setStatus("Cost estimates regenerated from current known/corrected values.");
}

function renderNodeCostEstimates() {
  for (const nodeId of TREE_NODE_IDS) refreshNodeCostField(nodeId);
}

// The player typed into the cost field directly -- that IS the correction.
// Backsolve the underlying baseAtomCost at the node's CURRENT ascension:level
// and persist it; don't rewrite the field itself here (would fight typing).
function onNodeCostInput(nodeId) {
  const prefix = NODE_INPUT_PREFIX[nodeId];
  const input = el(`${prefix}-cost-shown`);
  const tagEl = el(`${prefix}-cost-tag`);
  const level = parseInt(el(`${prefix}-level`)?.value, 10) || 0;
  const ascension = parseInt(el(`${prefix}-ascension`)?.value, 10) || 0;
  const raw = input.value.trim();
  if (raw === "") {
    delete nodeCostOverrides[nodeId];
  } else {
    const shown = parseFloat(raw);
    if (Number.isFinite(shown)) nodeCostOverrides[nodeId] = backsolveBaseCostLog10(nodeId, level, ascension, shown);
  }
  persistNodeCostOverrides();
  if (tagEl) tagEl.textContent = `(${nodeCostTag(nodeId)})`;
}

function selectTreeNode(nodeId) {
  selectedTreeNode = nodeId;
  el("tree-editor-empty").hidden = true;
  for (const id of TREE_NODE_IDS) {
    const panel = el(`tree-editor-${id}`);
    if (panel) panel.hidden = id !== nodeId;
  }
  renderTreeViz();
  el(`tree-editor-${nodeId}`)?.querySelector("input")?.focus();
}

function onTreeVizActivate(e) {
  const g = e.target.closest(".tv-node");
  if (!g) return;
  selectTreeNode(g.dataset.node);
}

function setupTreeViz() {
  loadNodeCostOverrides();
  renderTreeViz();
  renderNodeCostEstimates();
  const scroll = el("tree-viz-scroll");
  scroll.addEventListener("click", onTreeVizActivate);
  scroll.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onTreeVizActivate(e);
    }
  });
  for (const id of TREE_NODE_IDS) {
    const prefix = NODE_INPUT_PREFIX[id];
    // Ascension/level changed -> re-render the star and refresh this node's
    // cost field to the (possibly corrected) cost at the new ascension:level.
    for (const suffix of ["ascension", "level"]) {
      el(`${prefix}-${suffix}`)?.addEventListener("input", () => {
        renderTreeViz();
        refreshNodeCostField(id);
      });
    }
    // Cost field itself changed -> that's the player's correction, not a
    // display refresh (see onNodeCostInput's own comment for why these two
    // cases can't share a handler).
    el(`${prefix}-cost-shown`)?.addEventListener("input", () => onNodeCostInput(id));
  }
}

function persist() {
  try {
    const serializable = scenarios.map((s) => ({ ...s }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scenarios: serializable, compareSlots }));
  } catch (e) {
    console.warn("could not persist scenarios", e);
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      scenarios = parsed.scenarios ?? [];
      compareSlots = parsed.compareSlots ?? { a: null, b: null };
    }
  } catch (e) {
    console.warn("could not load saved scenarios", e);
    scenarios = [];
    compareSlots = { a: null, b: null };
  }
  sanitizeSlots();
}

// Drops slot assignments pointing at scenarios that no longer exist, and
// (only when a slot is empty and a scenario is free to fill it) auto-fills
// so the comparison view isn't blank right after a fresh load.
function sanitizeSlots() {
  const ids = new Set(scenarios.map((s) => s.id));
  if (compareSlots.a && !ids.has(compareSlots.a)) compareSlots.a = null;
  if (compareSlots.b && !ids.has(compareSlots.b)) compareSlots.b = null;
  if (!compareSlots.a && !compareSlots.b) {
    compareSlots.a = scenarios[0]?.id ?? null;
    compareSlots.b = scenarios[1]?.id ?? null;
  } else if (!compareSlots.a) {
    compareSlots.a = scenarios.find((s) => s.id !== compareSlots.b)?.id ?? null;
  } else if (!compareSlots.b) {
    compareSlots.b = scenarios.find((s) => s.id !== compareSlots.a)?.id ?? null;
  }
}

// Put a freshly created scenario into whichever slot is empty. If both are
// full, leave it unassigned -- the user picks it from the manager list
// below instead of it silently bumping something they're comparing.
function fillEmptySlot(id) {
  if (!compareSlots.a) compareSlots.a = id;
  else if (!compareSlots.b) compareSlots.b = id;
}

// A duplicate's natural partner is the scenario it was copied from: if
// that original is currently in a slot and the OTHER slot is free, put the
// copy there so it appears side by side with the original immediately.
function fillPartnerSlot(originalId, copyId) {
  if (compareSlots.a === originalId && !compareSlots.b) { compareSlots.b = copyId; return; }
  if (compareSlots.b === originalId && !compareSlots.a) { compareSlots.a = copyId; return; }
  fillEmptySlot(copyId);
}

function setSlot(slot, id) {
  compareSlots[slot] = compareSlots[slot] === id ? null : id;
  persist();
  renderScenarios();
}

async function onFindPath() {
  let stats;
  try {
    stats = readStatsForm();
  } catch (e) {
    setStatus(`Invalid input: ${e.message}`, true);
    return;
  }
  setStatus("Computing optimal path (this can take a moment)...");

  try {
    // Direct optimal path to the goal (X). Runs on a background worker.
    const direct = await runOptimizer(stats, stats.goal);
    if (!direct.reachable) {
      setStatus(`Goal not reached within ${stats.maxIterations} search iterations. Closest mult found: ${direct.finalStateMult.toFixed(4)}. Try raising max iterations (advanced).`, true);
      return;
    }
    const directExpanded = direct.expanded;
    const directScenario = makeScenario(`Optimal → mult ≥ ${stats.goal}`, stats, directExpanded.map(([a]) => a));

    // No compare goal: original single-scenario behavior.
    if (stats.compareGoal === null || stats.compareGoal <= stats.goal) {
      scenarios.unshift(directScenario);
      fillEmptySlot(directScenario.id);
      persist();
      renderScenarios();
      const note = stats.compareGoal !== null && stats.compareGoal <= stats.goal
        ? " (compare goal ignored: it must be higher than the goal)" : "";
      setStatus(`Found optimal path: ${formatDuration(direct.totalRealSeconds)} total, ${directExpanded.length} steps.${note}`);
      return;
    }

    // Compare: optimal path aimed at Y, truncated the moment it first reaches X.
    setStatus(`Computing comparison path aimed at ${stats.compareGoal}...`);
    const viaY = await runOptimizer(stats, stats.compareGoal);
    if (!viaY.reachable) {
      // Fall back to just the direct result rather than losing the work.
      scenarios.unshift(directScenario);
      fillEmptySlot(directScenario.id);
      persist();
      renderScenarios();
      setStatus(`Direct path found (${formatDuration(direct.totalRealSeconds)}), but the aim-at-${stats.compareGoal} path was not reached within ${stats.maxIterations} iterations.`, true);
      return;
    }

    const viaYExpanded = viaY.expanded;
    const stopIdx = viaYExpanded.findIndex(([, , mult]) => mult >= stats.goal);
    const truncated = stopIdx === -1 ? viaYExpanded : viaYExpanded.slice(0, stopIdx + 1);
    const viaYTimeAtX = truncated.reduce((a, [, dt]) => a + dt, 0);
    // Both times come from the expanded per-cycle paths (what the scenario cards
    // replay), so the banner is apples-to-apples and matches the card headers --
    // rather than mixing in the solver's collapsed-grind internal total.
    const directTimeAtX = directExpanded.reduce((a, [, dt]) => a + dt, 0);
    const viaYScenario = makeScenario(
      `Via → ${stats.compareGoal}, stopped at ${stats.goal}`, stats, truncated.map(([a]) => a),
    );

    // Put the two side by side in the compare slots (direct = A, via-Y = B).
    scenarios.unshift(viaYScenario);
    scenarios.unshift(directScenario);
    compareSlots.a = directScenario.id;
    compareSlots.b = viaYScenario.id;
    persist();
    renderScenarios();

    const delta = viaYTimeAtX - directTimeAtX;
    const cmp = Math.abs(delta) < 1e-6
      ? "identical"
      : `${formatDuration(Math.abs(delta))} ${delta > 0 ? "slower" : "faster"} via the ${stats.compareGoal} path`;
    setStatus(
      `To reach mult ≥ ${stats.goal}: direct ${formatDuration(directTimeAtX)} `
      + `vs ${formatDuration(viaYTimeAtX)} if aiming for ${stats.compareGoal} — ${cmp}.`,
    );
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message}`, true);
  }
}

// Run the optimizer for a specific goal on a background Web Worker so the UI
// stays responsive during the search. Correlates responses by id in case
// multiple runs overlap. The worker returns plain data: expanded paths are
// [action, dt, mult] triples rather than LogNum-bearing states.
let optimizerWorker = null;
let optimizerSeq = 0;
const pendingOptimizations = new Map();

function ensureWorker() {
  if (optimizerWorker) return optimizerWorker;
  optimizerWorker = new Worker(new URL("./optimizer.worker.js?v=20260722b", import.meta.url), { type: "module" });
  optimizerWorker.onmessage = (e) => {
    const { id, ok, result, error } = e.data;
    const pending = pendingOptimizations.get(id);
    if (!pending) return;
    pendingOptimizations.delete(id);
    if (ok) pending.resolve(result);
    else pending.reject(new Error(error));
  };
  optimizerWorker.onerror = (e) => {
    const err = new Error(e.message || "optimizer worker error");
    for (const { reject } of pendingOptimizations.values()) reject(err);
    pendingOptimizations.clear();
  };
  return optimizerWorker;
}

function runOptimizer(stats, goal, extra = {}) {
  const worker = ensureWorker();
  const id = ++optimizerSeq;
  return new Promise((resolve, reject) => {
    pendingOptimizations.set(id, { resolve, reject });
    worker.postMessage({ id, stats, goal, ...extra });
  });
}

// Find three ways to reach a one-off large atom target (10^pushExponent):
// the optimizer's best mix of sings + tree upgrades, a no-upgrades baseline,
// and an upgrade-heavier alternative -- all created as comparable scenarios.
const PUSH_VARIANT_TITLES = {
  optimal: (x) => `Push ${x} — optimal`,
  sing_only: (x) => `Push ${x} — sings only (no tree)`,
  tree_heavy: (x) => `Push ${x} — extra tree`,
};
const PUSH_VARIANT_ORDER = { optimal: 0, tree_heavy: 1, sing_only: 2 };

async function onFindPushPath() {
  let stats;
  try {
    stats = readStatsForm();
  } catch (e) {
    setStatus(`Invalid input: ${e.message}`, true);
    return;
  }
  if (stats.pushExponents.length === 0 || stats.pushExponents.some((x) => x <= 308)) {
    setStatus("Enter final push targets above 308 (e.g. 1020, 1040, ...) in the stats form.", true);
    return;
  }
  const targetsLabel = stats.pushExponents.map((x) => `e${x}`).join(", ");
  setStatus(`Computing paths through ${stats.pushExponents.length} push target(s): ${targetsLabel} (3 variants, this can take a while)...`);

  try {
    const res = await runOptimizer(stats, null, { mode: "push", pushExponents: stats.pushExponents });
    if (!res.reachable) {
      setStatus("Push target unreachable — growth stalls before it (check mult and penalties).", true);
      return;
    }
    const sorted = [...res.variants].sort(
      (a, b) => (PUSH_VARIANT_ORDER[a.name] ?? 9) - (PUSH_VARIANT_ORDER[b.name] ?? 9),
    );
    const shortLabel = stats.pushExponents.length === 1
      ? `e${stats.pushExponents[0]}`
      : `e${stats.pushExponents[0]}…e${stats.pushExponents[stats.pushExponents.length - 1]} (${stats.pushExponents.length})`;
    const created = sorted.map((v) => ({
      v,
      scenario: makeScenario(PUSH_VARIANT_TITLES[v.name]?.(shortLabel) ?? v.name, stats, v.expanded.map(([a]) => a)),
    }));
    for (let i = created.length - 1; i >= 0; i--) scenarios.unshift(created[i].scenario);

    const optimal = created.find((c) => c.v.name === "optimal") ?? created[0];
    const runnerUp = created
      .filter((c) => c !== optimal)
      .sort((a, b) => a.v.totalRealSeconds - b.v.totalRealSeconds)[0];
    compareSlots.a = optimal.scenario.id;
    compareSlots.b = runnerUp ? runnerUp.scenario.id : compareSlots.b;
    persist();
    renderScenarios();

    const shortNames = { optimal: "optimal", tree_heavy: "extra tree", sing_only: "sings only" };
    const parts = created.map((c) => `${shortNames[c.v.name] ?? c.v.name}: ${formatDuration(c.v.totalRealSeconds)}`);
    setStatus(`Push through ${targetsLabel} — ${parts.join(" · ")}`);
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message}`, true);
  }
}

// Rank +1 level on each tree node by time saved on the current push targets.
// Cost of buying the node is NOT modeled — only post-purchase push speed.
async function onRankTreeForPush() {
  const panel = el("tree-rank-result");
  let stats;
  try {
    stats = readStatsForm();
  } catch (e) {
    setStatus(`Invalid input: ${e.message}`, true);
    panel.hidden = true;
    return;
  }
  if (stats.pushExponents.length === 0 || stats.pushExponents.some((x) => x <= 308)) {
    setStatus("Enter final push targets above 308 (e.g. 1020, 1040, ...) in the stats form.", true);
    panel.hidden = true;
    return;
  }
  const targetsLabel = stats.pushExponents.map((x) => `e${x}`).join(", ");
  setStatus(`Ranking tree +1 upgrades for push ${targetsLabel}…`);
  panel.hidden = true;

  try {
    const res = await runOptimizer(stats, null, {
      mode: "rank-tree-push",
      pushExponents: stats.pushExponents,
    });
    if (!res.reachable || res.baselineSeconds == null) {
      setStatus("Push target unreachable with current stats — cannot rank tree upgrades.", true);
      return;
    }

    const base = res.baselineSeconds;
    const rows = res.rankings.map((r, i) => {
      const saved = r.savedSeconds;
      let saveCell;
      let saveClass = "save-zero";
      if (saved == null) {
        saveCell = "unreachable";
      } else if (Math.abs(saved) < 0.05) {
        saveCell = "≈ 0";
      } else if (saved > 0) {
        saveClass = "save-pos";
        const pct = base > 0 ? ` (${((saved / base) * 100).toFixed(2)}%)` : "";
        saveCell = `−${formatDuration(saved)}${pct}`;
      } else {
        saveClass = "save-neg";
        saveCell = `+${formatDuration(-saved)} slower`;
      }
      const timeCell = r.reachable && r.totalRealSeconds != null
        ? formatDuration(r.totalRealSeconds)
        : "—";
      const best = i === 0 && saved != null && saved > 0.05 ? " best-save" : "";
      return `<tr class="${best.trim()}">
        <td>${i + 1}</td>
        <td>${escapeHtml(r.label)}</td>
        <td>${timeCell}</td>
        <td class="${saveClass}">${saveCell}</td>
      </tr>`;
    }).join("");

    const top = res.rankings[0];
    const topNote = top && top.savedSeconds != null && top.savedSeconds > 0.05
      ? `Best next buy for this push: <strong>${escapeHtml(top.label)}</strong> (saves ${formatDuration(top.savedSeconds)}).`
      : "No single +1 tree level meaningfully shortens this push (all ≈ 0). Still useful if you are investing in tree long-term — pick by later targets.";

    panel.innerHTML = `
      <h3>Tree upgrade rank for push ${escapeHtml(targetsLabel)}</h3>
      <p class="tree-rank-note">
        Baseline (current tree): <strong>${formatDuration(base)}</strong>
        ${res.baselineVariant ? ` · best plan: ${escapeHtml(res.baselineVariant)}` : ""}.
        Each row is hypothetical <em>+1 level only</em> (upgrade cost not included).
      </p>
      <p class="tree-rank-note">${topNote}</p>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Upgrade (asc:level)</th>
            <th>Push time after</th>
            <th>vs baseline</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    panel.hidden = false;
    setStatus(`Tree rank for ${targetsLabel} — baseline ${formatDuration(base)}. See table below.`);
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message}`, true);
  }
}

// Rank +1-ascension hypotheticals (3.1/3.2/6.1/6.2/1.0/8.0, whichever isn't
// the rush target itself) plus a flat "Mult +100" row, all against the
// CURRENT "Rush a tree node" panel's target -- purchase cost not modeled,
// same convention as "Rank tree for push".
async function onRankTreeForRush() {
  const panel = el("rush-rank-result");
  let stats;
  try {
    stats = readStatsForm();
  } catch (e) {
    setStatus(`Invalid input: ${e.message}`, true);
    panel.hidden = true;
    return;
  }
  const stnId = el("rush-node-id").value;
  const targetAscension = parseInt(el("rush-target-ascension").value, 10) || 0;
  const targetLevel = parseInt(el("rush-target-level").value, 10) || 0;
  const [curLevel, curAscension] = stats.treeState[stnId] ?? [0, 0];
  if (targetAscension * 9 + targetLevel <= curAscension * 9 + curLevel) {
    setStatus(`STN ${stnId} is already at ${curAscension}:${curLevel} — target ${targetAscension}:${targetLevel} isn't further ahead.`, true);
    panel.hidden = true;
    return;
  }
  const nodeIsConfirmed = hasConfirmedCost(stnId);
  let costOverrideLog10 = null;
  if (!nodeIsConfirmed) {
    const shownRaw = el("rush-cost-shown").value.trim();
    if (shownRaw !== "") {
      const shown = parseFloat(shownRaw);
      if (Number.isFinite(shown)) costOverrideLog10 = backsolveBaseCostLog10(stnId, curLevel, curAscension, shown);
    }
  }

  setStatus(`Ranking tree +1 ascension upgrades for STN ${stnId} → ${targetAscension}:${targetLevel}…`);
  panel.hidden = true;

  try {
    const res = await runOptimizer(stats, null, {
      mode: "rank-tree-rush",
      rushTarget: { stnId, level: targetLevel, ascension: targetAscension, costOverrideLog10 },
    });
    if (!res.reachable || res.baselineSeconds == null) {
      setStatus("Rush target unreachable with current stats — cannot rank tree upgrades.", true);
      return;
    }

    const base = res.baselineSeconds;
    const rows = res.rankings.map((r, i) => {
      const saved = r.savedSeconds;
      let saveCell;
      let saveClass = "save-zero";
      if (saved == null) {
        saveCell = "unreachable";
      } else if (Math.abs(saved) < 0.05) {
        saveCell = "≈ 0";
      } else if (saved > 0) {
        saveClass = "save-pos";
        const pct = base > 0 ? ` (${((saved / base) * 100).toFixed(2)}%)` : "";
        saveCell = `−${formatDuration(saved)}${pct}`;
      } else {
        saveClass = "save-neg";
        saveCell = `+${formatDuration(-saved)} slower`;
      }
      const timeCell = r.reachable && r.totalRealSeconds != null
        ? formatDuration(r.totalRealSeconds)
        : "—";
      const best = i === 0 && saved != null && saved > 0.05 ? " best-save" : "";
      return `<tr class="${best.trim()}">
        <td>${i + 1}</td>
        <td>${escapeHtml(r.label)}</td>
        <td>${timeCell}</td>
        <td class="${saveClass}">${saveCell}</td>
      </tr>`;
    }).join("");

    const top = res.rankings[0];
    const topNote = top && top.savedSeconds != null && top.savedSeconds > 0.05
      ? `Best lever for this rush: <strong>${escapeHtml(top.label)}</strong> (saves ${formatDuration(top.savedSeconds)}).`
      : "No single +1 ascension or Mult +100 meaningfully shortens this rush (all ≈ 0).";

    panel.innerHTML = `
      <h3>Tree upgrade rank for rushing STN ${escapeHtml(stnId)} → ${targetAscension}:${targetLevel}</h3>
      <p class="tree-rank-note">
        Baseline (current tree, current Mult): <strong>${formatDuration(base)}</strong>.
        Each row is hypothetical <em>+1 full ascension</em> (not +1 level -- see tooltip) or a flat Mult bump, purchase/grind cost to GET there not included.
      </p>
      <p class="tree-rank-note">${topNote}</p>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Hypothetical change</th>
            <th>Rush time after</th>
            <th>vs baseline</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    panel.hidden = false;
    setStatus(`Tree rank for rushing STN ${stnId} → ${targetAscension}:${targetLevel} — baseline ${formatDuration(base)}. See table below.`);
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message}`, true);
  }
}

// Show/hide the "cost shown in-game" field: only relevant for the 10 nodes
// without a confirmed cost formula (STN 1.0/3.1/3.2 don't need it). Prefills
// it from that node's own tree-editor-panel override (if the player already
// entered one there) so the same number doesn't have to be typed twice.
function syncRushCostField() {
  const stnId = el("rush-node-id").value;
  el("rush-cost-field").hidden = hasConfirmedCost(stnId);
  const prefix = NODE_INPUT_PREFIX[stnId];
  const nodeOverride = el(`${prefix}-cost-shown`)?.value.trim();
  if (nodeOverride) el("rush-cost-shown").value = nodeOverride;
}

// "+N" quick-fill: reads the target node's CURRENT ascension:level straight
// off the tree star (not the last-read stats snapshot) and fills Target
// ascension/level with the state N purchases from now, so you don't have to
// do the level/ascension-wrap math yourself.
function onQuickAddTarget(n) {
  const stnId = el("rush-node-id").value;
  const prefix = NODE_INPUT_PREFIX[stnId];
  const curLevel = parseInt(el(`${prefix}-level`)?.value, 10) || 0;
  const curAscension = parseInt(el(`${prefix}-ascension`)?.value, 10) || 0;
  const [newLevel, newAscension] = advanceByBuys(curLevel, curAscension, n);
  el("rush-target-level").value = newLevel;
  el("rush-target-ascension").value = newAscension;
}

// Fastest path to bring one tree node to a target ascension:level, buying
// the standard nodes (1.0/3.1/3.2) or grinding Sings along the way if
// that's faster. STN 1.0/3.1/3.2 create an editable scenario, same as Find
// Push Path; the other 10 (no confirmed cost, estimated or user-entered)
// only report a time estimate -- the scenario editor doesn't know how to
// replay a non-standard node purchase (see NOTES/architecture.md).
async function onRushNode() {
  let stats;
  try {
    stats = readStatsForm();
  } catch (e) {
    setStatus(`Invalid input: ${e.message}`, true);
    return;
  }
  const stnId = el("rush-node-id").value;
  const targetAscension = parseInt(el("rush-target-ascension").value, 10) || 0;
  const targetLevel = parseInt(el("rush-target-level").value, 10) || 0;
  const [curLevel, curAscension] = stats.treeState[stnId] ?? [0, 0];
  if (targetAscension * 9 + targetLevel <= curAscension * 9 + curLevel) {
    setStatus(`STN ${stnId} is already at ${curAscension}:${curLevel} — target ${targetAscension}:${targetLevel} isn't further ahead.`, true);
    return;
  }

  const nodeIsConfirmed = hasConfirmedCost(stnId);
  let costOverrideLog10 = null;
  if (!nodeIsConfirmed) {
    const shownRaw = el("rush-cost-shown").value.trim();
    if (shownRaw !== "") {
      const shown = parseFloat(shownRaw);
      if (!Number.isFinite(shown)) {
        setStatus(`"Cost shown in-game" must be a number (power of 10).`, true);
        return;
      }
      costOverrideLog10 = backsolveBaseCostLog10(stnId, curLevel, curAscension, shown);
    }
  }

  setStatus(`Computing fastest path to STN ${stnId} ${targetAscension}:${targetLevel}…`);

  try {
    const res = await runOptimizer(stats, null, {
      mode: "rush-node",
      rushTarget: { stnId, level: targetLevel, ascension: targetAscension, costOverrideLog10 },
    });
    if (!res.reachable) {
      setStatus(`STN ${stnId} ${targetAscension}:${targetLevel} not reached within ${stats.maxIterations} search iterations. Try raising max iterations (advanced), or the atom cost may be effectively unreachable from here.`, true);
      return;
    }
    const costNote = nodeIsConfirmed ? "" : costOverrideLog10 != null ? " (entered cost)" : " (estimated cost)";
    const scenario = makeScenario(
      `Rush STN ${stnId} → ${targetAscension}:${targetLevel}`, stats, res.expanded.map(([a]) => a),
      nodeIsConfirmed ? undefined : { stnId, costOverrideLog10 },
    );
    scenarios.unshift(scenario);
    fillEmptySlot(scenario.id);
    persist();
    renderScenarios();
    setStatus(`STN ${stnId} → ${targetAscension}:${targetLevel}${costNote}: ${formatDuration(res.totalRealSeconds)}, ${res.expanded.length} steps.`);
  } catch (e) {
    console.error(e);
    setStatus(`Error: ${e.message}`, true);
  }
}

// Standalone calculator: time to grow from 10^x to 10^y atoms at the current
// Singularity Mult and stats, holding mult fixed (no upgrades/Singularizing).
function onCalcExponent() {
  const resultEl = () => el("exponent-result");
  const setResult = (msg, isError = false) => {
    const r = resultEl();
    r.textContent = msg;
    r.classList.toggle("error", isError);
  };

  let stats;
  try {
    stats = readStatsForm();
  } catch (e) {
    setResult(`Invalid input: ${e.message}`, true);
    return;
  }

  const from = parseFloat(el("exp-from").value);
  const to = parseFloat(el("exp-to").value);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    setResult("Enter numeric from/to exponents.", true);
    return;
  }
  if (to <= from) {
    setResult("To exponent must be greater than from exponent.", true);
    return;
  }

  const clearExtras = () => {
    el("exponent-chart").hidden = true;
    el("exponent-chart").innerHTML = "";
    el("exponent-thresholds").innerHTML = "";
  };

  try {
    const result = estimateTimeToNextSingularity({
      baseM: stats.startingMult,
      targetAtoms: `e${to}`,
      staticFactors: stats.staticFactors,
      currentAtoms: `e${from}`,
      removedPenalties: stats.removedPenalties,
      penaltyOverrides: buildBaseOverrides(stats),
      localSpeed: stats.localSpeed,
    });
    if (!result.reachable) {
      setResult("Unreachable — growth stalls (gain multiplier ≤ 1) before reaching the target.", true);
      clearExtras();
      return;
    }
    setResult(`10^${from} → 10^${to} atoms: ${formatDuration(result.totalRealSeconds)} at ${stats.localSpeed}x local speed (mult ${stats.startingMult}).`);

    // Growth is piecewise-linear in (exponent vs time): each milestone is a
    // threshold crossed, with cumulative real-time. Plot start -> milestones.
    const points = [{ t: 0, y: from, label: "start" }];
    for (const ms of result.milestones) {
      points.push({ t: ms.realSeconds, y: ms.atomRequirement.log10, name: ms.name });
    }
    el("exponent-chart").innerHTML = buildExponentChart(points, from, to);
    el("exponent-chart").hidden = false;
    el("exponent-thresholds").innerHTML = buildThresholdList(result.milestones, from);
  } catch (e) {
    setResult(`Error: ${e.message}`, true);
    clearExtras();
  }
}

function onBlankScenario() {
  let stats;
  try {
    stats = readStatsForm();
  } catch (e) {
    setStatus(`Invalid input: ${e.message}`, true);
    return;
  }
  const scenario = makeScenario("Custom plan", stats, []);
  scenarios.unshift(scenario);
  fillEmptySlot(scenario.id);
  persist();
  renderScenarios();
}

function duplicateScenario(id) {
  const original = scenarios.find((s) => s.id === id);
  if (!original) return;
  const copy = { ...original, id: crypto.randomUUID(), title: `${original.title} (copy)`, actions: [...original.actions] };
  const idx = scenarios.findIndex((s) => s.id === id);
  scenarios.splice(idx + 1, 0, copy);
  fillPartnerSlot(id, copy.id);
  persist();
  renderScenarios();
}

function deleteScenario(id) {
  scenarios = scenarios.filter((s) => s.id !== id);
  if (compareSlots.a === id) compareSlots.a = null;
  if (compareSlots.b === id) compareSlots.b = null;
  sanitizeSlots();
  persist();
  renderScenarios();
}

function clearAllScenarios() {
  if (scenarios.length === 0) return;
  if (!confirm(`Delete all ${scenarios.length} scenario(s)? This cannot be undone.`)) return;
  scenarios = [];
  compareSlots = { a: null, b: null };
  persist();
  renderScenarios();
}

// --- Export/import to a local file ------------------------------------
// localStorage autosave (persistForm/persist) survives a normal reload, but
// not clearing browser data, a different browser/profile, or moving to
// another computer -- these two give the player an explicit backup they
// control. The exported file is the same shape as the two localStorage
// entries combined, so import is just "write this into localStorage and
// re-render", not a separate parser.
const BACKUP_VERSION = 1;

function exportBackup() {
  const formData = {};
  formFields().forEach((f) => {
    formData[f.id] = f.type === "checkbox" ? f.checked : f.value;
  });
  const payload = { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), form: formData, scenarios, compareSlots };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const a = document.createElement("a");
  a.href = url;
  a.download = `revidle-planner-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setStatus("Backup downloaded.");
}

function applyImportedPayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("not a valid backup file");
  if (payload.form && typeof payload.form === "object") {
    formFields().forEach((f) => {
      if (!(f.id in payload.form)) return;
      if (f.type === "checkbox") f.checked = payload.form[f.id];
      else f.value = payload.form[f.id];
    });
    // Re-sync the RN "maxed" checkboxes' disabling of their level input,
    // same wiring as init() -- an imported "maxed: true" shouldn't leave a
    // stale, editable level number.
    for (const id of ["rn126", "rn127", "rn128", "rn131", "rn136"]) {
      const levelInput = el(`${id}-level`);
      const maxedBox = el(`${id}-maxed`);
      if (levelInput && maxedBox) levelInput.disabled = maxedBox.checked;
    }
  }
  if (Array.isArray(payload.scenarios)) scenarios = payload.scenarios;
  if (payload.compareSlots && typeof payload.compareSlots === "object") compareSlots = payload.compareSlots;
  sanitizeSlots();
  persistForm();
  persist();
  renderScenarios();
  renderTreeViz();
  syncRushCostField();
}

function onImportFileChosen(e) {
  const file = e.target.files?.[0];
  e.target.value = ""; // allow re-choosing the same file later
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      applyImportedPayload(JSON.parse(reader.result));
      setStatus(`Imported backup from "${file.name}".`);
    } catch (err) {
      setStatus(`Could not import "${file.name}": ${err.message}`, true);
    }
  };
  reader.onerror = () => setStatus(`Could not read "${file.name}".`, true);
  reader.readAsText(file);
}

function insertStep(scenarioId, index, action) {
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return;
  scenario.actions.splice(index, 0, action);
  persist();
  renderScenarios();
}

function removeStep(scenarioId, index) {
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return;
  scenario.actions.splice(index, 1);
  persist();
  renderScenarios();
}

function changeStep(scenarioId, index, action) {
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return;
  scenario.actions[index] = action;
  persist();
  renderScenarios();
}

function renameScenario(scenarioId, title) {
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return;
  scenario.title = title;
  persist();
}

function quickStats(scenario) {
  try {
    const ctx = buildCtx(scenario);
    const start = buildStartState(scenario, ctx);
    const replay = replayActionsPartial(scenario.actions, start, ctx);
    const totalStr = replay.failedAt === null ? formatDuration(replay.totalTime) : `${formatDuration(replay.totalTime)} (stuck)`;
    return `${totalStr} · mult ${replay.finalState.mult.toFixed(4)}`;
  } catch (e) {
    return "error";
  }
}

// Collapse a scenario's flat action list into grouped, human-readable lines:
// consecutive grinds become "Grind from x mult to y mult", consecutive
// upgrades of the same node become "Upgrade STN 1.0 from a.b to c.d".
function summarizePath(scenario) {
  const ctx = buildCtx(scenario);
  const start = buildStartState(scenario, ctx);
  const replay = replayActionsPartial(scenario.actions, start, ctx);

  // States before each step: index 0 = start, i = state after action i-1.
  const states = [start];
  const usable = replay.failedAt === null ? scenario.actions.length : replay.failedAt;
  for (let i = 0; i < usable; i++) states.push(replay.steps[i].state);

  const lines = [];
  let i = 0;
  let pushIdx = 0;
  const pushExponents = scenario.pushExponents ?? [];
  while (i < usable) {
    const action = scenario.actions[i];
    let j = i;
    while (j + 1 < usable && scenario.actions[j + 1] === action) j++;
    const before = states[i];
    const after = states[j + 1];
    const count = j - i + 1;

    if (isGrindAction(action)) {
      // grind_xN is already a batch; plain grind may be collapsed across rows.
      let sings = 0;
      for (let k = i; k <= j; k++) {
        const a = scenario.actions[k];
        if (a === "grind") sings += 1;
        else if (typeof a === "string" && a.startsWith("grind_x")) sings += parseInt(a.slice(7), 10) || 0;
      }
      lines.push(`Grind from ${before.mult.toFixed(4)} mult to ${after.mult.toFixed(4)} mult (${sings}×)`);
    } else if (action === "final_push") {
      for (let k = 0; k < count; k++) {
        lines.push(`Final push to 10^${pushExponents[pushIdx] ?? "?"} atoms → mult ${states[i + k + 1]?.mult.toFixed(4) ?? "?"}`);
        pushIdx++;
      }
    } else if (NODE_KEYS[action]) {
      const [asc, lvl, label] = NODE_KEYS[action];
      lines.push(`Upgrade ${label} from ${before[asc]}.${before[lvl]} to ${after[asc]}.${after[lvl]}`);
    } else if (typeof action === "string" && action.startsWith("upgrade_")) {
      // Non-standard rushed node (searchCore.js upgradeGeneric) -- tracked via
      // targetLevel/targetAscension, not a NODE_KEYS entry.
      lines.push(`Upgrade STN ${action.slice("upgrade_".length)} from ${before.targetAscension}.${before.targetLevel} to ${after.targetAscension}.${after.targetLevel}`);
    }
    i = j + 1;
  }

  if (lines.length === 0) lines.push("(no steps yet)");
  if (replay.failedAt !== null) lines.push(`⚠ Path stalls at step ${replay.failedAt + 1} (growth stalled or grind never completes).`);
  const totalStr = replay.failedAt === null ? formatDuration(replay.totalTime) : `${formatDuration(replay.totalTime)} so far`;
  return { lines, totalStr, finalMult: replay.finalState.mult.toFixed(4) };
}

function showSummary(scenarioId) {
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return;
  let summary;
  try {
    summary = summarizePath(scenario);
  } catch (e) {
    summary = { lines: [`Error building summary: ${e.message}`], totalStr: "—", finalMult: "—" };
  }
  const body = summary.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("");
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3>${escapeHtml(scenario.title)} — path summary</h3>
        <button class="modal-close" data-op="close-summary" title="Close">×</button>
      </div>
      <p class="modal-meta">Total time: ${summary.totalStr} · Final mult: ${summary.finalMult}</p>
      <ol class="summary-list">${body}</ol>
    </div>
  `;
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.dataset.op === "close-summary") close();
  });
  document.addEventListener("keydown", function onEsc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", onEsc); }
  });
  document.body.appendChild(overlay);
}

function renderManagerRow(scenario) {
  const isA = compareSlots.a === scenario.id;
  const isB = compareSlots.b === scenario.id;
  return `
    <div class="manager-row" data-scenario-id="${scenario.id}">
      <span class="manager-title">${escapeHtml(scenario.title)}</span>
      <span class="manager-stats">${quickStats(scenario)} · ${scenario.actions.length} steps</span>
      <div class="manager-buttons">
        <button data-op="assign-a" class="${isA ? "toggle-on" : ""}" title="Show in left pane">A</button>
        <button data-op="assign-b" class="${isB ? "toggle-on" : ""}" title="Show in right pane">B</button>
        <button data-op="summary">Summary</button>
        <button data-op="duplicate">Duplicate</button>
        <button data-op="delete" class="danger">Delete</button>
      </div>
    </div>
  `;
}

function renderScenarioCard(scenario, slotLabel) {
  const ctx = buildCtx(scenario);
  const start = buildStartState(scenario, ctx);
  let replay;
  try {
    replay = replayActionsPartial(scenario.actions, start, ctx);
  } catch (e) {
    return `<div class="scenario-card"><div class="scenario-header"><span>${escapeHtml(scenario.title)}</span></div>
      <p class="error">Error simulating this scenario: ${escapeHtml(e.message)}</p></div>`;
  }

  const rushExtra = scenario.rushTarget ? `upgrade_${scenario.rushTarget.stnId}` : null;
  const tm0 = totalMult(scenario.totalMultBase, start.n1Level, start.n1Ascension, start.mult, ctx.multBonuses, ctx.stn8);
  const rows = [];
  rows.push(`
    <tr class="start-row">
      <td>0</td><td>start</td><td>—</td>
      <td>${multCell(start.mult, tm0)}</td>
      <td>${stnCell(start, scenario.rushTarget)}</td>
      <td></td>
    </tr>
  `);

  let prevMult = start.mult;
  const usable = replay.failedAt === null ? scenario.actions.length : replay.failedAt;
  let i = 0;
  while (i < scenario.actions.length) {
    const action = scenario.actions[i];
    const blocked = i >= usable;

    const controls = `
      <button class="icon-btn" data-op="insert" data-idx="${i}" title="Insert step above">+</button>
      <button class="icon-btn danger" data-op="remove" data-idx="${i}" title="Remove step">×</button>
    `;

    if (blocked) {
      rows.push(`
        <tr class="blocked-row">
          <td>${i + 1}</td>
          <td>
            <select data-op="change" data-idx="${i}">${actionOptionsHtml(action, rushExtra)}</select>
          </td>
          <td colspan="3">${i === replay.failedAt ? "unreachable here (growth stalled or grind never completes)" : "—"}</td>
          <td>${controls}</td>
        </tr>
      `);
      i++;
      continue;
    }

    // Run of consecutive identical actions (never spanning the blocked tail).
    // final_push never collapses: each occurrence targets a different exponent.
    let j = i;
    while (action !== "final_push" && j + 1 < usable && scenario.actions[j + 1] === action) j++;
    const count = j - i + 1;

    if (count === 1) {
      const step = replay.steps[i];
      const tm = totalMult(scenario.totalMultBase, step.state.n1Level, step.state.n1Ascension, step.state.mult, ctx.multBonuses, ctx.stn8);
      const deltaMult = step.state.mult - prevMult;
      prevMult = step.state.mult;
      const actionCell = typeof action === "string" && action.startsWith("grind_x")
        ? `<span class="run-label">${escapeHtml(actionLabel(action))}</span>`
        : `<select data-op="change" data-idx="${i}">${actionOptionsHtml(action, rushExtra)}</select>`;
      rows.push(`
        <tr>
          <td>${i + 1}</td>
          <td>${actionCell}</td>
          <td>+${formatDuration(step.dt)}</td>
          <td>${multCell(step.state.mult, tm, deltaMult)}</td>
          <td>${stnCell(step.state, scenario.rushTarget)}</td>
          <td>${controls}</td>
        </tr>
      `);
      i++;
      continue;
    }

    // Collapsed row for the whole run: total time, end state, net mult delta.
    const lastStep = replay.steps[j];
    let dtSum = 0;
    for (let k = i; k <= j; k++) dtSum += replay.steps[k].dt;
    const tm = totalMult(scenario.totalMultBase, lastStep.state.n1Level, lastStep.state.n1Ascension, lastStep.state.mult, ctx.multBonuses, ctx.stn8);
    const deltaMult = lastStep.state.mult - prevMult;
    prevMult = lastStep.state.mult;
    const lbl = actionLabel(action);
    const runControls = `
      <button class="icon-btn" data-op="insert" data-idx="${i}" title="Add one more ${lbl}">+</button>
      <button class="icon-btn danger" data-op="remove" data-idx="${i}" title="Remove one ${lbl}">×</button>
      <button class="icon-btn danger" data-op="remove-run" data-idx="${i}" data-count="${count}" title="Remove all ${count} ${lbl} steps">×all</button>
    `;
    rows.push(`
      <tr class="run-row">
        <td>${i + 1}–${j + 1}</td>
        <td><span class="run-label">${escapeHtml(lbl)} ×${count}</span></td>
        <td title="avg ${formatDuration(dtSum / count)} per step">+${formatDuration(dtSum)}</td>
        <td>${multCell(lastStep.state.mult, tm, deltaMult)}</td>
        <td>${stnCell(lastStep.state, scenario.rushTarget)}</td>
        <td>${runControls}</td>
      </tr>
    `);
    i = j + 1;
  }

  const totalStr = replay.failedAt === null ? formatDuration(replay.totalTime) : `${formatDuration(replay.totalTime)} so far (then stuck)`;
  const finalMultStr = replay.finalState.mult.toFixed(4);

  return `
    <div class="scenario-card" data-scenario-id="${scenario.id}">
      <div class="scenario-header">
        <span class="slot-badge">${slotLabel}</span>
        <input type="text" class="title-input" data-op="rename" value="${escapeHtml(scenario.title)}" />
        <div class="scenario-buttons">
          <button data-op="summary">Summary</button>
          <button data-op="duplicate">Duplicate</button>
          <button data-op="delete" class="danger">Delete</button>
        </div>
      </div>
      <div class="scenario-summary">
        <span><strong>Total time:</strong> ${totalStr}</span>
        <span><strong>Final mult:</strong> ${finalMultStr}</span>
        <span><strong>Steps:</strong> ${scenario.actions.length}</span>
      </div>
      <div class="steps-scroll">
        <table class="steps-table">
          <thead>
            <tr><th>#</th><th>action</th><th>time</th><th>mult</th><th title="STN 1.0 / 3.1 / 3.2${scenario.rushTarget ? ` / ${scenario.rushTarget.stnId}` : ""} (ascension.level)">tree</th><th></th></tr>
          </thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>
      <div class="scenario-footer">
        <select data-op="new-step-type">${actionOptionsHtml("grind", rushExtra)}</select>
        <input type="number" class="step-count" data-op="new-step-count" min="1" max="1000" step="1" value="1" title="How many to add" />
        <button data-op="append-step">+ Add steps at end</button>
      </div>
    </div>
  `;
}

// Rebuilding #scenarios' innerHTML throws away the old DOM nodes, including
// each step table's scrolled position -- without this, adding/removing a
// row anywhere jumps every pane back to the top. Capture each pane's
// scrollTop (keyed by scenario id, so it survives even if slot assignment
// changes) plus the page's own scroll position, and restore both after
// the rebuild.
function captureScrollState() {
  const state = { windowY: window.scrollY, panes: {} };
  document.querySelectorAll(".scenario-card").forEach((card) => {
    const scroller = card.querySelector(".steps-scroll");
    if (scroller) state.panes[card.dataset.scenarioId] = scroller.scrollTop;
  });
  return state;
}

function restoreScrollState(state) {
  document.querySelectorAll(".scenario-card").forEach((card) => {
    const id = card.dataset.scenarioId;
    if (id in state.panes) {
      const scroller = card.querySelector(".steps-scroll");
      if (scroller) scroller.scrollTop = state.panes[id];
    }
  });
  window.scrollTo(0, state.windowY);
}

function renderScenarios() {
  const container = el("scenarios");
  const scrollState = captureScrollState();

  if (scenarios.length === 0) {
    container.innerHTML = `<p class="empty-hint">No scenarios yet. Fill in your stats above and click "Find Optimal Path", or start a blank custom plan.</p>`;
    return;
  }

  const managerHtml = `<div class="scenario-manager">${scenarios.map(renderManagerRow).join("")}</div>`;

  const scenarioA = scenarios.find((s) => s.id === compareSlots.a);
  const scenarioB = scenarios.find((s) => s.id === compareSlots.b);
  const paneA = scenarioA
    ? renderScenarioCard(scenarioA, "A")
    : `<div class="empty-pane">No scenario in slot A. Click "A" on one below.</div>`;
  const paneB = scenarioB
    ? renderScenarioCard(scenarioB, "B")
    : `<div class="empty-pane">No scenario in slot B. Click "B" on one below.</div>`;
  const compareHtml = `
    <div class="compare-grid">
      <div class="compare-pane">${paneA}</div>
      <div class="compare-pane">${paneB}</div>
    </div>
  `;

  container.innerHTML = managerHtml + compareHtml;
  restoreScrollState(scrollState);
}

function onScenariosClick(e) {
  const op = e.target.dataset.op;
  if (!op) return;

  const managerRow = e.target.closest(".manager-row");
  if (managerRow) {
    const id = managerRow.dataset.scenarioId;
    if (op === "assign-a") return setSlot("a", id);
    if (op === "assign-b") return setSlot("b", id);
    if (op === "summary") return showSummary(id);
    if (op === "duplicate") return duplicateScenario(id);
    if (op === "delete") return deleteScenario(id);
    return;
  }

  const card = e.target.closest(".scenario-card");
  if (!card) return;
  const id = card.dataset.scenarioId;

  if (op === "summary") return showSummary(id);
  if (op === "duplicate" || op === "delete") {
    if (op === "duplicate") duplicateScenario(id);
    if (op === "delete") deleteScenario(id);
    return;
  }
  if (op === "insert" || op === "remove") {
    const idx = parseInt(e.target.dataset.idx, 10);
    if (op === "insert") {
      // Insert a copy of the row's own action (clicking + on a STN 1.0 row
      // adds another STN 1.0 step), not a hard-coded grind.
      const scenario = scenarios.find((s) => s.id === id);
      insertStep(id, idx, scenario.actions[idx] ?? "grind");
    }
    if (op === "remove") removeStep(id, idx);
    return;
  }
  if (op === "remove-run") {
    const idx = parseInt(e.target.dataset.idx, 10);
    const count = parseInt(e.target.dataset.count, 10);
    const scenario = scenarios.find((s) => s.id === id);
    if (!scenario) return;
    scenario.actions.splice(idx, count);
    persist();
    renderScenarios();
    return;
  }
  if (op === "append-step") {
    const typeSelect = card.querySelector('[data-op="new-step-type"]');
    const countInput = card.querySelector('[data-op="new-step-count"]');
    const count = Math.max(1, Math.min(1000, parseInt(countInput?.value, 10) || 1));
    const scenario = scenarios.find((s) => s.id === id);
    for (let n = 0; n < count; n++) scenario.actions.push(typeSelect.value);
    persist();
    renderScenarios();
  }
}

function onScenariosChange(e) {
  const card = e.target.closest(".scenario-card");
  if (!card) return;
  const op = e.target.dataset.op;
  if (op === "change") {
    changeStep(card.dataset.scenarioId, parseInt(e.target.dataset.idx, 10), e.target.value);
  }
}

function onScenariosInput(e) {
  if (e.target.dataset.op === "rename") {
    const card = e.target.closest(".scenario-card");
    renameScenario(card.dataset.scenarioId, e.target.value);
  }
}

// Tab switching: the config panel above stays shared; only the calculator
// panels below toggle. Both read the same #stats-form, so settings are shared.
function setupTabs() {
  const tabs = [...document.querySelectorAll(".tab")];
  const panels = [...document.querySelectorAll(".tab-panel")];
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const name = tab.dataset.tab;
      for (const t of tabs) {
        const on = t === tab;
        t.classList.toggle("active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
      }
      for (const p of panels) {
        const on = p.dataset.tab === name;
        p.classList.toggle("active", on);
        p.hidden = !on;
      }
    });
  }
}

function init() {
  applyTooltips();
  load();
  renderScenarios();
  setupTabs();
  el("find-path-btn").addEventListener("click", onFindPath);
  el("find-push-btn").addEventListener("click", onFindPushPath);
  el("rank-tree-push-btn").addEventListener("click", onRankTreeForPush);
  el("rush-node-btn").addEventListener("click", onRushNode);
  el("rank-tree-rush-btn").addEventListener("click", onRankTreeForRush);
  el("rush-node-id").addEventListener("change", syncRushCostField);
  syncRushCostField();
  for (const btn of document.querySelectorAll(".quick-add-btn")) {
    btn.addEventListener("click", () => onQuickAddTarget(parseInt(btn.dataset.add, 10)));
  }
  el("blank-scenario-btn").addEventListener("click", onBlankScenario);
  el("clear-scenarios-btn").addEventListener("click", clearAllScenarios);
  el("regenerate-cost-guesses-btn").addEventListener("click", onRegenerateCostGuesses);
  el("export-backup-btn").addEventListener("click", exportBackup);
  el("import-backup-btn").addEventListener("click", () => el("import-backup-input").click());
  el("import-backup-input").addEventListener("change", onImportFileChosen);
  el("calc-exponent-btn").addEventListener("click", onCalcExponent);
  el("scenarios").addEventListener("click", onScenariosClick);
  el("scenarios").addEventListener("change", onScenariosChange);
  el("scenarios").addEventListener("input", onScenariosInput);

  loadForm();
  el("stats-form").addEventListener("input", persistForm);
  el("stats-form").addEventListener("change", persistForm);
  setupTreeViz();
  el("mult-breakdown").addEventListener("input", onMultBreakdownInput);
  el("mult-breakdown").addEventListener("change", onMultBreakdownInput);
  // First-ever load (nothing persisted yet): show the all-defaults product
  // (1) instead of a blank read-only field. Never runs once a real value --
  // typed or computed -- has been saved, so it can't clobber loadForm()'s
  // restore.
  if (!el("total-mult-shown").value) el("total-mult-shown").value = formatMultBreakdownProduct(computeMultBreakdownProduct());

  // "maxed" checkbox greys out the level number for each RN node -- you don't
  // need to know its true in-game max level, just check the box once it's
  // fully upgraded (readRnLevel treats maxed as level 10).
  for (const id of ["rn126", "rn127", "rn128", "rn131", "rn136"]) {
    const levelInput = el(`${id}-level`);
    const maxedBox = el(`${id}-maxed`);
    const sync = () => { levelInput.disabled = maxedBox.checked; };
    maxedBox.addEventListener("change", sync);
    sync();
  }
}

init();
