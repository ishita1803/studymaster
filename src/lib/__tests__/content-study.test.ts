import { beforeEach, describe, expect, it } from "vitest";
import {
  InsufficientMaterialError,
  studyCachedCount,
  studyContent,
} from "../ai/content-study";

/**
 * Realistic note body: chapters with definitions the same way lecture notes
 * read. Deliberately long enough to pass every sufficiency gate.
 */
const BIOLOGY_NOTES = [
  "Photosynthesis is the process by which plants convert light energy into glucose.",
  "Chlorophyll is the green pigment inside chloroplasts that absorbs light energy.",
  "Respiration is the release of energy from glucose inside mitochondria.",
  "Osmosis is the movement of water across a partially permeable membrane.",
  "Enzymes are proteins that speed up reactions without being used up.",
  "Diffusion is the movement of particles from a high to a low concentration.",
  "Mitosis produces two genetically identical cells for growth and repair.",
  "Active transport uses energy to move particles against the concentration gradient.",
  "Each concept links back to glucose: photosynthesis makes glucose, and respiration releases energy from it.",
  "These ideas recur across every unit because cells depend on glucose.",
].join("\n\n");

// Not a git-tagged API key — tests must run with AI disabled (local study only).
beforeEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe("content study — the mandatory understanding stage", () => {
  it("studies the whole document and identifies real concepts", async () => {
    const study = await studyContent(BIOLOGY_NOTES);

    expect(study.sufficient).toBe(true);
    expect(study.chunksStudied).toBeGreaterThan(0);
    expect(study.sentences).toBeGreaterThan(5);
    const terms = study.concepts.map((concept) => concept.term);
    expect(terms).toContain("Photosynthesis");
    expect(terms).toContain("Osmosis");
    // "is"-definitions (Photosynthesis is ..., Osmosis is ...) are captured;
    // non-copular phrasing ("Mitosis produces ...") is intentionally not
    // reported as a definition.
    expect(study.concepts.length).toBeGreaterThanOrEqual(5);
  });

  it("never invents concepts that are not in the notes", async () => {
    const study = await studyContent(BIOLOGY_NOTES);
    const terms = study.concepts.map((concept) => concept.term);

    for (const fabricated of [
      "Quantum entanglement",
      "Blockchain",
      "Pythagorean theorem",
    ]) {
      expect(terms).not.toContain(fabricated);
    }
    for (const concept of study.concepts) {
      const normalized = BIOLOGY_NOTES.toLowerCase();
      expect(
        normalized.includes(concept.term.toLowerCase()) ||
          normalized.includes(concept.meaning.toLowerCase().slice(0, 20)),
      ).toBe(true);
    }
  });

  it("refuses to generate from empty or title-only material", async () => {
    await expect(studyContent("")).rejects.toBeInstanceOf(InsufficientMaterialError);
    // A bare topic-name fallback line is not study material.
    await expect(
      studyContent("Biology: Cells, Genetics, Ecology"),
    ).rejects.toBeInstanceOf(InsufficientMaterialError);
  });

  it("refuses a too-short snippet and reports why", async () => {
    let caught: InsufficientMaterialError | null = null;
    try {
      await studyContent("Mitochondria produce energy.");
    } catch (error) {
      caught = error as InsufficientMaterialError;
    }
    expect(caught).toBeInstanceOf(InsufficientMaterialError);
    expect(caught?.message.toLowerCase()).toMatch(/content|sentences|material/);
  });

  it("caches repeated study of the same material (one pass shared)", async () => {
    const before = studyCachedCount();
    const first = await studyContent(BIOLOGY_NOTES + "\n\nCache probe one.");
    const second = await studyContent(BIOLOGY_NOTES + "\n\nCache probe one.");

    expect(second).toBe(first);
    expect(studyCachedCount()).toBe(before + 1);
    expect(second.sourceKey).toBe(first.sourceKey);
  });

  it("studies different materials independently", async () => {
    const chemistry =
      "Covalent bonding is the sharing of electron pairs between atoms. " +
      "Ionic bonding is the transfer of electrons from a metal to a non-metal. " +
      "Methane has four covalent bonds arranged tetrahedrally around carbon. " +
      "Chlorophyll is unrelated here because this text is chemistry content. " +
      "Metals conduct electricity because delocalised electrons move freely. " +
      "Alloys are mixtures of metals with altered properties for engineering. " +
      "Simple molecular substances have low melting points from weak forces.";
    const study = await studyContent(chemistry);

    expect(study.sufficient).toBe(true);
    const terms = study.concepts.map((concept) => concept.term);
    expect(terms).not.toContain("Mitosis");
  });
});
