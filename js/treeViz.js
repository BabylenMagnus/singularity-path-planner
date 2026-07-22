// Inline-SVG renderer for the Singularity Tree, laid out to match the
// in-game star shape (see NOTES/model.md "Layout"): node 8 at the top,
// two branches (.1 left, .2 right) fanning down through tiers 7-6-5-4-3,
// meeting at node 2, which drops to node 1 at the bottom. Pure
// (state) => htmlString, same shape as renderHelpers.js's other builders --
// no DOM access, no module state.

import { TOOLTIPS } from "./tooltips.js?v=20260723a";

// Node id -> the existing input-id prefix (n1/s31/... predate this file;
// keeping them lets loadForm()/persistForm() in app.js work unmodified,
// since they key purely off element id, not node id).
export const NODE_INPUT_PREFIX = {
  "1.0": "n1", "2.0": "n2",
  "3.1": "s31", "3.2": "s32",
  "4.1": "s41", "4.2": "s42",
  "5.1": "s51", "5.2": "s52",
  "6.1": "s61", "6.2": "s62",
  "7.1": "s71", "7.2": "s72",
  "8.0": "s8",
};

export const TREE_NODE_IDS = Object.keys(NODE_INPUT_PREFIX);

const EDGES = [
  ["1.0", "2.0"], ["2.0", "3.1"], ["2.0", "3.2"],
  ["3.1", "4.1"], ["3.2", "4.2"], ["4.1", "5.1"], ["4.2", "5.2"],
  ["5.1", "6.1"], ["5.2", "6.2"], ["6.1", "7.1"], ["6.2", "7.2"],
  ["7.1", "8.0"], ["7.2", "8.0"],
];

const CX = 260, CY = 270, RING = 170;
const TIER_ANGLE = { 7: 18, 6: 54, 5: 90, 4: 126, 3: 162 };

function ringPos(angleDeg, radius) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.sin(rad), y: CY - radius * Math.cos(rad) };
}

// Precomputed {x, y, r} per node id -- geometry only depends on the tree
// shape, never on tree state, so this is a plain constant.
const LAYOUT = (() => {
  const pos = {};
  for (const [tier, branch] of [[7, 1], [7, 2], [6, 1], [6, 2], [5, 1], [5, 2], [4, 1], [4, 2], [3, 1], [3, 2]]) {
    const sign = branch === 1 ? -1 : 1;
    pos[`${tier}.${branch}`] = { ...ringPos(sign * TIER_ANGLE[tier], RING), r: 20 };
  }
  pos["8.0"] = { ...ringPos(0, RING + 70), r: 26 };
  // Vertical offset that puts node 2 at the same height as the 3.1/3.2 ring
  // nodes: those sit at TIER_ANGLE[3] (162°) from top, i.e. 18° up from the
  // bottom axis, so their drop from ring-center is RING*cos(18deg) -- using
  // cos(162deg) here directly would flip the sign and put node 2 near the top.
  const node2Radius = RING * Math.cos(((180 - TIER_ANGLE[3]) * Math.PI) / 180);
  pos["2.0"] = { ...ringPos(180, node2Radius), r: 24 };
  pos["1.0"] = { ...ringPos(180, node2Radius + 88), r: 24 };
  return pos;
})();

export const TREE_VIEWBOX = "0 0 520 570";

function nodeState(treeState, id) {
  const [level, ascension] = treeState?.[id] ?? [0, 0];
  return { level: level || 0, ascension: ascension || 0 };
}

function titleFor(id, level, ascension) {
  const prefix = NODE_INPUT_PREFIX[id];
  const blurb = TOOLTIPS[`${prefix}-level`] ?? `Singularity Tree Node ${id}`;
  return `${blurb}\nCurrent: ascension ${ascension}, level ${level}`;
}

// treeState: { "1.0": [level, ascension], ... } (may be partial/undefined --
// missing entries render as 0:0). selectedId: currently open node, or null.
export function buildTreeSvg(treeState, selectedId) {
  const edgeLines = EDGES.map(([a, b]) => {
    const pa = LAYOUT[a], pb = LAYOUT[b];
    return `<line x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}" x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}" class="tv-edge" />`;
  }).join("");

  const nodes = TREE_NODE_IDS.map((id) => {
    const { x, y, r } = LAYOUT[id];
    const { level, ascension } = nodeState(treeState, id);
    const active = level > 0 || ascension > 0;
    const selected = id === selectedId;
    const classes = ["tv-node", active ? "tv-active" : "", selected ? "tv-selected" : ""].filter(Boolean).join(" ");
    const label = id.endsWith(".0") ? id.slice(0, -2) : id;
    return `<g class="${classes}" data-node="${id}" tabindex="0" role="button"
        aria-pressed="${selected}" aria-label="STN ${label}, ascension ${ascension} level ${level}, click to edit">
      <title>${escapeXml(titleFor(id, level, ascension))}</title>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" class="tv-circle" />
      <text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="tv-label">${label}</text>
    </g>`;
  }).join("");

  return `<svg viewBox="${TREE_VIEWBOX}" role="group" aria-label="Singularity Tree, 13 nodes" style="width:100%;max-width:560px;height:auto;">
    <style>
      .tv-edge { stroke: var(--border); stroke-width: 3; }
      .tv-circle { fill: var(--panel-bg); stroke: var(--border); stroke-width: 2; transition: fill 0.15s ease, stroke 0.15s ease, filter 0.15s ease; }
      .tv-label { fill: var(--muted); font-size: 15px; font-weight: 700; text-anchor: middle; dominant-baseline: central; pointer-events: none; transition: fill 0.15s ease; }
      .tv-node { cursor: pointer; }
      .tv-active .tv-circle { fill: color-mix(in oklab, var(--accent) 16%, var(--panel-bg)); stroke: var(--accent); }
      .tv-active .tv-label { fill: var(--text); }
      .tv-node:hover .tv-circle, .tv-node:focus-visible .tv-circle { stroke: var(--accent); filter: drop-shadow(0 0 6px color-mix(in oklab, var(--accent) 55%, transparent)); }
      .tv-node:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .tv-selected .tv-circle { stroke: var(--accent); stroke-width: 3; filter: drop-shadow(0 0 8px color-mix(in oklab, var(--accent) 65%, transparent)); }
      @media (prefers-reduced-motion: reduce) {
        .tv-circle, .tv-label { transition: none; }
      }
    </style>
    ${edgeLines}
    ${nodes}
  </svg>`;
}

function escapeXml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
