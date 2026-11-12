import { describe, expect, it } from "vitest";
import { prettyMath } from "../formula";

describe("prettyMath", () => {
  it("renders fractions and square roots", () => {
    expect(prettyMath("\\frac{a}{b}")).toBe("(a)⁄(b)");
    expect(prettyMath("\\sqrt{x+1}")).toBe("√(x+1)");
  });

  it("converts powers and subscripts to Unicode", () => {
    expect(prettyMath("x^{2} + y^{2}")).toBe("x² + y²");
    expect(prettyMath("H_{2}O")).toBe("H₂O");
    expect(prettyMath("a_n")).toBe("aₙ");
  });

  it("replaces common operators and Greek letters", () => {
    expect(prettyMath("\\alpha \\times \\beta")).toBe("α × β");
    expect(prettyMath("a \\le b \\neq c")).toBe("a ≤ b ≠ c");
  });

  it("leaves plain text readable", () => {
    expect(prettyMath("rate = distance / time")).toBe("rate = distance / time");
  });
});
