// Log10-space big numbers for beyond-float64 magnitudes.
// Direct port of singularity_sim/bignum.py -- see that file for the reasoning.

export class LogNum {
  constructor(log10) {
    this.log10 = log10;
  }

  static fromValue(value) {
    if (!(value > 0)) throw new Error(`LogNum requires a positive value, got ${value}`);
    return new LogNum(Math.log10(value));
  }

  // Parses "1000", "1.60e256", "e300" (implicit-1 shorthand), and
  // "e8.52e28" (nested-exponent game display) without float overflow.
  static parse(text) {
    if (text instanceof LogNum) return text;
    if (typeof text === "number") return LogNum.fromValue(text);
    const s = String(text).trim().toLowerCase();
    if (!s) throw new Error("empty string is not a number");
    if (s.startsWith("e")) {
      return new LogNum(parseFloat(s.slice(1)));
    }
    if (s.includes("e")) {
      const idx = s.indexOf("e");
      const mantissa = parseFloat(s.slice(0, idx));
      if (!(mantissa > 0)) throw new Error(`LogNum requires a positive value, got ${text}`);
      return new LogNum(Math.log10(mantissa) + parseFloat(s.slice(idx + 1)));
    }
    return LogNum.fromValue(parseFloat(s));
  }

  mul(other) {
    return new LogNum(this.log10 + asLog10(other));
  }

  div(other) {
    return new LogNum(this.log10 - asLog10(other));
  }

  pow(exponent) {
    return new LogNum(this.log10 * exponent);
  }

  lt(other) { return this.log10 < asLog10(other); }
  lte(other) { return this.log10 <= asLog10(other); }
  gt(other) { return this.log10 > asLog10(other); }
  gte(other) { return this.log10 >= asLog10(other); }
  eq(other) { return this.log10 === asLog10(other); }

  toFloat() {
    return this.log10 > 308.25 ? Infinity : Math.pow(10, this.log10);
  }

  toString() {
    if (Math.abs(this.log10) < 6) return formatSig(this.toFloat(), 4);
    const exp = Math.floor(this.log10);
    const mantissa = Math.pow(10, this.log10 - exp);
    if (Math.abs(exp) < 1e6) return `${mantissa.toFixed(3)}e${exp}`;
    return `e${formatSig(this.log10, 4)}`;
  }
}

function asLog10(other) {
  if (other instanceof LogNum) return other.log10;
  if (typeof other === "number") {
    if (!(other > 0)) throw new Error(`cannot compare/combine LogNum with non-positive ${other}`);
    return Math.log10(other);
  }
  throw new TypeError(`unsupported operand type: ${typeof other}`);
}

function formatSig(x, sig) {
  if (x === 0) return "0";
  return Number(x.toPrecision(sig)).toString();
}
