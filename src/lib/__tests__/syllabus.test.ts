import { describe, expect, it } from "vitest";
import {
  flattenSyllabus,
  isCoverBannerName,
  isGroundedInSource,
  localSyllabus,
  statementChapters,
  validateSyllabus,
} from "../ai/syllabus";

const source = [
  "Page 1",
  "Chapter 1: Cell Biology",
  "- Cell membrane",
  "- Mitochondria",
  "Photosynthesis is the process by which plants make glucose.",
  "Example 1: Calculate the rate of diffusion.",
  "Page 2",
  "Chapter 2: Genetics",
  "- DNA replication",
  "- Alleles",
].join("\n");

describe("isCoverBannerName", () => {
  it("flags fully-capitalised multi-word banner lines, not acronym topics", () => {
    expect(isCoverBannerName("PYTHON PROGRAMMING")).toBe(true);
    expect(isCoverBannerName("AKTU SYLLABUS UNIT-1")).toBe(true);
    expect(isCoverBannerName("UNIT I")).toBe(true);
    expect(isCoverBannerName("OSI Model")).toBe(false);
    expect(isCoverBannerName("DNA Replication")).toBe(false);
    expect(isCoverBannerName("SQL Queries")).toBe(false);
    expect(isCoverBannerName("miniproject")).toBe(false);
  });

  it("rejects cover-banner headings through localSyllabus", () => {
    const nodes = localSyllabus(
      [
        "PYTHON PROGRAMMING",
        "AKTU SYLLABUS UNIT-1",
        "Chapter 1: Python Basics",
        "- Variables",
        "- Data types",
      ].join("\n"),
      "miniproject",
    );
    const names = flattenSyllabus(nodes).map((row) => row.name);
    expect(names).not.toContain("PYTHON PROGRAMMING");
    expect(names).not.toContain("AKTU SYLLABUS UNIT-1");
    expect(names).toContain("Python Basics");
  });
});

describe("isGroundedInSource", () => {
  it("accepts names whose significant words appear in the source", () => {
    expect(isGroundedInSource("Cell membrane", source)).toBe(true);
    expect(isGroundedInSource("DNA replication", source)).toBe(true);
  });

  it("rejects invented topics", () => {
    expect(isGroundedInSource("Quantum tunnelling", source)).toBe(false);
    expect(isGroundedInSource("Cell membrane", source)).toBe(true);
  });
});

describe("validateSyllabus", () => {
  it("keeps grounded chapters and topics, drops generic or invented ones", () => {
    const nodes = validateSyllabus(
      {
        chapters: [
          {
            title: "Cell Biology",
            sourceRef: "p. 1",
            topics: [
              { name: "Cell membrane", kind: "topic" },
              { name: "Mitochondria", kind: "topic" },
              { name: "Introduction", kind: "topic" },
              { name: "Quantum tunnelling", kind: "concept" },
            ],
          },
          {
            title: "Astrophysics",
            topics: [{ name: "Stellar fusion" }],
          },
        ],
      },
      source,
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe("Cell Biology");
    expect(nodes[0].sourceRef).toBe("p. 1");
    expect(nodes[0].children.map((child) => child.name)).toEqual([
      "Cell membrane",
      "Mitochondria",
    ]);
  });

  it("preserves subtopic hierarchy and removes duplicate names", () => {
    const nodes = validateSyllabus(
      {
        chapters: [
          {
            title: "Genetics",
            topics: [
              {
                name: "DNA replication",
                subtopics: [
                  { name: "Leading strand" },
                  { name: "Leading strand" },
                ],
              },
            ],
          },
        ],
      },
      `${source}\nLeading strand synthesis is continuous.`,
    );

    expect(nodes[0].children[0].name).toBe("DNA replication");
    expect(nodes[0].children[0].children.map((child) => child.name)).toEqual([
      "Leading strand",
    ]);
  });

  it("returns an empty list when nothing in the response is grounded", () => {
    const nodes = validateSyllabus(
      { chapters: [{ title: "Astrophysics", topics: [{ name: "Stellar fusion" }] }] },
      source,
    );
    expect(nodes).toEqual([]);
  });

  it("drops the subject name when it is the only thing returned", () => {
    const nodes = validateSyllabus(
      { chapters: [{ title: "Biology", topics: [{ name: "Biology" }] }] },
      "Biology\nBiology",
      "Biology",
    );
    expect(nodes).toEqual([]);
  });
});

describe("localSyllabus", () => {
  const aktuScreenshot = [
    "PYTHON PROGRAMMING",
    "AKTU SYLLABUS UNIT-1",
    "Introduction to Python: Python variables, Python basic Operators, Understanding python blocks. Python Data Types, Declaring and using Numeric data types: int, float etc.",
  ].join("\n");

  it("turns an official unit statement into its real topics — never the subject name", () => {
    // Regression: this exact upload produced chapter "miniproject" (the
    // SUBJECT name) with the single keyword topic "Python".
    const nodes = localSyllabus(aktuScreenshot, "miniproject");

    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe("Introduction to Python");
    const names = nodes[0].children.map((child) => child.name);
    expect(names).toContain("Python variables");
    expect(names).toContain("Python basic Operators");
    expect(names).toContain("Understanding python blocks");
    expect(names).toContain("Python Data Types");
    expect(names).toContain("Declaring and using Numeric data types");
    expect(names).not.toContain("Python");
    expect(names).not.toContain("miniproject");
  });

  it("statement chapters strip banner words glued in front of the real lead", () => {
    const glued =
      "PYTHON PROGRAMMING AKTU SYLLABUS UNIT-1 Introduction to Python: Python variables, Python basic Operators. Python Data Types, Numeric data types: int, float etc.";
    const nodes = statementChapters(glued, "miniproject");

    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe("Introduction to Python");
    const names = nodes[0].children.map((child) => child.name);
    expect(names).toContain("Python variables");
    expect(names).toContain("Python basic Operators");
  });

  it("normalises a bare unit lead into a readable chapter title", () => {
    const nodes = statementChapters(
      "UNIT-1: Data structures, Arrays and lists. Stacks and queues, Trees and graphs.",
      "dsa",
    );
    expect(nodes.map((node) => node.name)).toEqual(["Unit 1"]);
    expect(nodes[0].children.map((child) => child.name)).toContain(
      "Data structures",
    );
  });

  it("builds chapters and topics from real headings, bullets and definitions", () => {
    const nodes = localSyllabus(source);

    expect(nodes.map((node) => node.name)).toEqual(["Cell Biology", "Genetics"]);
    const biology = nodes[0];
    expect(biology.children.map((child) => child.name)).toContain("Cell membrane");
    expect(biology.children.map((child) => child.name)).toContain("Mitochondria");
    expect(biology.children.some((child) => child.kind === "definition")).toBe(true);
    expect(biology.children.some((child) => child.kind === "problem")).toBe(true);
  });

  it("keeps page references and never emits page numbers as topics", () => {
    const nodes = localSyllabus(source);
    const names = nodes.flatMap((node) => [
      node.name,
      ...node.children.map((child) => child.name),
    ]);

    expect(names.some((name) => /^page\s*\d+$/i.test(name))).toBe(false);
    expect(nodes[0].sourceRef).toBe("p. 1");
    expect(nodes[1].sourceRef).toBe("p. 2");
  });

  it("returns no invented topics when the document has no structure", () => {
    const nodes = localSyllabus("The quick brown fox jumps over the lazy dog.");
    expect(nodes).toEqual([]);
  });
});

describe("flattenSyllabus", () => {
  it("links every child row to its parent key and keeps reading order", () => {
    const rows = flattenSyllabus(localSyllabus(source));
    const chapter = rows.find((row) => row.name === "Cell Biology");
    const child = rows.find((row) => row.name === "Cell membrane");

    expect(chapter?.parentKey).toBeNull();
    expect(child?.parentKey).toBe(chapter?.key);
    expect(child?.chapter).toBe("Cell Biology");
    const chapters = rows.filter((row) => row.parentKey === null);
    expect(chapters.map((row) => row.position)).toEqual(
      chapters.map((_, index) => index),
    );
    const children = rows.filter((row) => row.parentKey === chapter?.key);
    expect(children.map((row) => row.position)).toEqual(
      children.map((_, index) => index),
    );
  });
});
