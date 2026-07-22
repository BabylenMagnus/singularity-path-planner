// Pure HTML-string / label helpers used when rendering scenarios and the
// exponent calculator: no DOM access, no module-level state -- input in,
// string out. Split out of app.js so the stateful UI code (scenario CRUD,
// event wiring) isn't tangled up with presentation formatting.

import { formatDuration } from "./growth.js?v=20260723b";

export const ACTIONS = ["grind", "upgrade_1.0", "upgrade_3.1", "upgrade_3.2", "final_push"];
export const ACTION_LABELS = {
  grind: "Sing",
  "upgrade_1.0": "STN 1.0",
  "upgrade_3.1": "STN 3.1",
  "upgrade_3.2": "STN 3.2",
  final_push: "Final push",
};

export function actionLabel(action) {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  if (typeof action === "string" && action.startsWith("grind_x")) {
    const n = action.slice(7);
    return `Sing ×${n}`;
  }
  // Non-standard tree node upgrade (e.g. "upgrade_8.0"), rushed via a
  // rushTarget scenario -- not in ACTION_LABELS since it's dynamic per scenario.
  if (typeof action === "string" && action.startsWith("upgrade_")) return `STN ${action.slice("upgrade_".length)}`;
  return action;
}

export function isGrindAction(action) {
  return action === "grind" || (typeof action === "string" && action.startsWith("grind_x"));
}

export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// `extra`, when given (a scenario's rushTarget node, e.g. "upgrade_8.0"), is
// appended so its step's <select> (and the "add steps at end" footer picker)
// can offer/select it -- it isn't in the static ACTIONS list since it's a
// per-scenario, non-standard node rather than one of the 3 always-available ones.
export function actionOptionsHtml(selected, extra = null) {
  const options = extra && !ACTIONS.includes(extra)
    ? [...ACTIONS, extra]
    : ACTIONS;
  return options.map((a) => `<option value="${a}" ${a === selected ? "selected" : ""}>${escapeHtml(actionLabel(a))}</option>`).join("");
}

// Compact vertical stack (1.0 / 3.1 / 3.2, in that fixed order) instead of
// a wide slash-joined string -- keeps the table narrow enough to fit one
// column without horizontal scrolling. `rushTarget`, when given, appends a
// 4th line for the non-standard node this scenario is rushing (state.targetLevel/
// targetAscension -- see searchCore.js upgradeGeneric).
export function stnCell(state, rushTarget = null) {
  const rushLine = rushTarget
    ? `<span title="STN ${rushTarget.stnId} (ascension.level, rushed)">${state.targetAscension}.${state.targetLevel}</span>`
    : "";
  return `<span class="tree-stack">
    <span title="STN 1.0 (ascension.level)">${state.n1Ascension}.${state.n1Level}</span>
    <span title="STN 3.1 (ascension.level)">${state.s31Ascension}.${state.s31Level}</span>
    <span title="STN 3.2 (ascension.level)">${state.s32Ascension}.${state.s32Level}</span>
    ${rushLine}
  </span>`;
}

// Mult, its delta, and Total Mult all stacked on their own line -- narrower
// than putting them side by side, which is what keeps the whole table
// fitting in one column without a horizontal scrollbar.
export function multCell(mult, tm, deltaMult = 0) {
  const deltaHtml = deltaMult > 1e-9 ? `<span class="delta">+${deltaMult.toFixed(4)}</span>` : "";
  return `<span class="mult-stack"><span class="mult-main">${mult.toFixed(4)}</span>${deltaHtml}<span class="tm-sub">TM ${tm.toFixed(4)}</span></span>`;
}

export const NODE_KEYS = {
  "upgrade_1.0": ["n1Ascension", "n1Level", "STN 1.0"],
  "upgrade_3.1": ["s31Ascension", "s31Level", "STN 3.1"],
  "upgrade_3.2": ["s32Ascension", "s32Level", "STN 3.2"],
};

// Pretty threshold name for the exponent calc's milestone list: penalties are
// named "penalty_1e50" etc.; show them as 10^N with a short note.
export function thresholdLabel(name) {
  if (name === "target") return "target";
  if (name === "relic_69_bonus") return "Relic 69 activates (10^6)";
  const m = name.match(/penalty_([0-9._e]+)/i);
  return m ? `Atom penalty at ${m[1].replace("_", ".")}` : name;
}

// Atom mult = g = m^(1.02*p), the per-application atom gain after every
// active penalty/buff factor is folded into p. Kept short since it's
// typically a small number (unlike the LogNum-scale atom totals).
export function formatAtomMult(g) {
  if (!Number.isFinite(g)) return "—";
  return g.toFixed(4);
}

// The threshold's effective exponent (^X Atom Gain) after overrides -- e.g.
// STN 3.1/3.2 weakening or the Relic 69 bonus -- have been folded in by
// effectiveExponent(). Shown at full precision rather than trimmed, since
// this is the exact p-chain factor being multiplied in, not a display total.
export function formatExactExponent(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return x.toPrecision(6).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function buildThresholdList(milestones, from) {
  const crossed = milestones.filter((ms) => ms.name !== "target");
  const rows = crossed.map((ms) => `
    <tr>
      <td>10<sup>${Math.round(ms.atomRequirement.log10)}</sup></td>
      <td>${escapeHtml(thresholdLabel(ms.name))}</td>
      <td>${formatDuration(ms.realSeconds)}</td>
      <td>${formatExactExponent(ms.exponent)}</td>
      <td>${formatAtomMult(ms.gainPerSecond)}</td>
    </tr>`).join("");
  const target = milestones[milestones.length - 1];
  const targetRow = target ? `
    <tr class="threshold-target">
      <td>10<sup>${Math.round(target.atomRequirement.log10)}</sup></td>
      <td>goal</td>
      <td>${formatDuration(target.realSeconds)}</td>
      <td>—</td>
      <td>${formatAtomMult(target.gainPerSecond)}</td>
    </tr>` : "";
  const intro = crossed.length
    ? `<p class="threshold-intro">Thresholds crossed on the way from 10<sup>${from}</sup>:</p>`
    : `<p class="threshold-intro">No atom thresholds are crossed before the goal.</p>`;
  return `${intro}
    <table class="threshold-table">
      <thead><tr><th>atoms</th><th>threshold</th><th>time to reach</th><th title="Effective ^X Atom Gain exponent applied at this threshold, after STN 3.1/3.2 and Relic 69 overrides">penalty/buff</th><th title="Atom gain per formula application after all penalties/buffs">atom mult</th></tr></thead>
      <tbody>${rows}${targetRow}</tbody>
    </table>`;
}

// A minimal inline-SVG line chart of atom exponent (y) vs real time (x). Points
// are {t, y}; the polyline through them is exact (linear within each segment).
export function buildExponentChart(points, yMin, yMax) {
  const W = 800, H = 360, padL = 60, padR = 18, padT = 18, padB = 40;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const tMax = points[points.length - 1].t || 1;
  const yLo = yMin, yHi = yMax > yMin ? yMax : yMin + 1;
  const xOf = (t) => padL + (t / tMax) * plotW;
  const yOf = (v) => padT + plotH - ((v - yLo) / (yHi - yLo)) * plotH;

  const poly = points.map((p) => `${xOf(p.t).toFixed(1)},${yOf(p.y).toFixed(1)}`).join(" ");

  // Interior threshold dots (skip the start point).
  const dots = points.slice(1).map((p) =>
    `<circle cx="${xOf(p.t).toFixed(1)}" cy="${yOf(p.y).toFixed(1)}" r="3.5" class="c-dot" />`).join("");

  // Axis ticks: 5 along each axis.
  const yTicks = [], xTicks = [];
  for (let i = 0; i <= 5; i++) {
    const v = yLo + ((yHi - yLo) * i) / 5;
    const y = yOf(v).toFixed(1);
    yTicks.push(`<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" class="c-grid" />
      <text x="${padL - 8}" y="${y}" text-anchor="end" dominant-baseline="middle" class="c-lbl">10^${Math.round(v)}</text>`);
    const t = (tMax * i) / 5;
    const x = xOf(t).toFixed(1);
    xTicks.push(`<text x="${x}" y="${H - padB + 18}" text-anchor="middle" class="c-lbl">${escapeHtml(formatDuration(t))}</text>`);
  }

  // CSS custom properties resolve inside an SVG <style> block (CSS context) but
  // NOT in presentation attributes like stroke="var(--x)" -- so theme colors go
  // through classes here, keeping the chart light/dark aware.
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Atom exponent over time" style="max-width:100%;height:auto;">
    <style>
      .c-grid { stroke: var(--border); stroke-width: 1; }
      .c-axis { stroke: var(--border); stroke-width: 1; }
      .c-curve { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; }
      .c-dot { fill: var(--accent); }
      .c-lbl { fill: var(--muted); font-size: 12px; }
    </style>
    ${yTicks.join("")}
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" class="c-axis" />
    <polyline points="${poly}" class="c-curve" />
    ${dots}
    ${xTicks.join("")}
    <text x="${padL + plotW / 2}" y="${H - 4}" text-anchor="middle" class="c-lbl">real time →</text>
  </svg>`;
}
