/**
 * Converts the common LaTeX fragments found in study notes into readable
 * Unicode. Kept framework-free so it can be unit tested and reused on the
 * server or client.
 */

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  n: "ⁿ",
  i: "ⁱ",
  x: "ˣ",
  y: "ʸ",
};

const SUBSCRIPT: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
  a: "ₐ",
  e: "ₑ",
  i: "ᵢ",
  o: "ₒ",
  x: "ₓ",
  n: "ₙ",
};

const SYMBOLS: Record<string, string> = {
  "\\times": "×",
  "\\cdot": "·",
  "\\div": "÷",
  "\\pm": "±",
  "\\mp": "∓",
  "\\le": "≤",
  "\\leq": "≤",
  "\\ge": "≥",
  "\\geq": "≥",
  "\\neq": "≠",
  "\\ne": "≠",
  "\\approx": "≈",
  "\\equiv": "≡",
  "\\infty": "∞",
  "\\sum": "∑",
  "\\prod": "∏",
  "\\int": "∫",
  "\\partial": "∂",
  "\\nabla": "∇",
  "\\rightarrow": "→",
  "\\to": "→",
  "\\leftarrow": "←",
  "\\Rightarrow": "⇒",
  "\\leftrightarrow": "↔",
  "\\alpha": "α",
  "\\beta": "β",
  "\\gamma": "γ",
  "\\delta": "δ",
  "\\epsilon": "ε",
  "\\theta": "θ",
  "\\lambda": "λ",
  "\\mu": "μ",
  "\\pi": "π",
  "\\rho": "ρ",
  "\\sigma": "σ",
  "\\tau": "τ",
  "\\phi": "φ",
  "\\omega": "ω",
  "\\Delta": "Δ",
  "\\Omega": "Ω",
  "\\Sigma": "Σ",
  "\\%": "%",
};

function toScript(value: string, map: Record<string, string>) {
  return value
    .split("")
    .map((character) => map[character] ?? character)
    .join("");
}

export function prettyMath(math: string) {
  let out = math.trim();

  // \frac{a}{b} and \sqrt{x} first, because they contain braces.
  out = out.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)⁄($2)");
  out = out.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  out = out.replace(/\\text\s*\{([^{}]*)\}/g, "$1");
  out = out.replace(/\\mathrm\s*\{([^{}]*)\}/g, "$1");

  out = out.replace(/\^\{([^{}]*)\}/g, (_, value: string) =>
    toScript(value, SUPERSCRIPT),
  );
  out = out.replace(/\^(\w)/g, (_, value: string) => toScript(value, SUPERSCRIPT));
  out = out.replace(/_\{([^{}]*)\}/g, (_, value: string) =>
    toScript(value, SUBSCRIPT),
  );
  out = out.replace(/_(\w)/g, (_, value: string) => toScript(value, SUBSCRIPT));

  out = out.replace(/\\[a-zA-Z]+/g, (command) => SYMBOLS[command] ?? command.slice(1));
  out = out.replace(/[{}]/g, "");
  out = out.replace(/\s+/g, " ").trim();

  return out;
}

/** Matches inline `$...$` and block `$$...$$` segments. */
export const MATH_PATTERN = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
