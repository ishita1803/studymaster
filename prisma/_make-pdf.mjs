import fs from "node:fs";

const pages = [
  {
    title: "Chapter 1: Cell Biology",
    lines: [
      "A cell is the basic structural and functional unit of all living organisms.",
      "An organelle is a specialised part of a cell that performs a specific job.",
      "Mitochondria are the organelles where aerobic respiration releases energy.",
      "A ribosome is the organelle that builds proteins from amino acids.",
      "Osmosis is the movement of water across a partially permeable membrane.",
      "Diffusion is the movement of particles from high concentration to low concentration.",
      "An enzyme is a protein that speeds up a chemical reaction.",
      "A catalyst is a substance that speeds up a reaction without being used up.",
      "The nucleus is the organelle that contains genetic material and controls the cell.",
      "The cytoplasm is the jelly-like substance where most cell reactions happen.",
    ],
  },
  {
    title: "Chapter 2: Genetics",
    lines: [
      "A gene is a section of DNA that codes for one characteristic.",
      "An allele is a version of a gene that controls one characteristic.",
      "A chromosome is a long coiled molecule of DNA found in the nucleus.",
      "DNA is the molecule that stores genetic information.",
      "A dominant allele is an allele that is expressed even when only one copy is present.",
      "A recessive allele is an allele that is only expressed when two copies are present.",
      "A genotype is the combination of alleles an organism carries.",
      "A phenotype is the observable characteristics of an organism.",
      "Mitosis is the process where a cell divides to produce identical body cells.",
      "Meiosis is the process where a cell divides to produce gametes.",
    ],
  },
  {
    title: "Chapter 3: Ecology",
    lines: [
      "An ecosystem is a community of organisms interacting with their environment.",
      "A producer is an organism that makes its own food using light energy.",
      "A consumer is an organism that obtains energy by eating other organisms.",
      "A decomposer is an organism that breaks down dead material and recycles nutrients.",
      "A food chain is a sequence that shows the flow of energy between organisms.",
      "Photosynthesis is the process where plants use light energy to make glucose.",
      "Respiration is the process where cells release energy from glucose.",
      "A habitat is the place where an organism lives.",
      "A population is all the organisms of one species living in an area.",
      "Biodiversity is the variety of different species in an ecosystem.",
    ],
  },
  {
    title: "Chapter 4: Motion and Forces",
    lines: [
      "Speed is the distance travelled per unit time.",
      "Velocity is speed in a stated direction.",
      "Acceleration is the rate at which velocity changes.",
      "A force is a push or pull that can change an object's motion.",
      "Mass is the amount of matter in an object.",
      "Weight is the force of gravity acting on a mass.",
      "Speed = distance / time, where speed is measured in metres per second.",
      "Acceleration = change in velocity / time, where acceleration is measured in metres per second squared.",
      "Force = mass x acceleration, where force is measured in newtons.",
      "Momentum is the product of an object's mass and velocity.",
    ],
  },
];

function escapePdf(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(text, width = 86) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

const fontObjNumber = 3 + pages.length * 2;
const objects = [];

objects.push("<< /Type /Catalog /Pages 2 0 R >>");
const kids = pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);

for (const [index, page] of pages.entries()) {
  const pageObjNumber = 3 + index * 2;
  const contentObjNumber = pageObjNumber + 1;
  const textLines = [
    page.title,
    "",
    ...page.lines.flatMap((line) => [...wrap(line), ""]),
  ];
  const content = [
    "BT",
    "/F1 11 Tf",
    "72 740 Td",
    "16 TL",
    ...textLines.map((line) => `(${escapePdf(line)}) Tj T*`),
    "ET",
  ].join("\n");

  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjNumber} 0 R >> >> /Contents ${contentObjNumber} 0 R >>`,
  );
  objects.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
}

objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

let pdf = "%PDF-1.4\n";
const offsets = [0];
for (const [index, body] of objects.entries()) {
  offsets.push(Buffer.byteLength(pdf, "latin1"));
  pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
}
const xrefOffset = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += "0000000000 65535 f \n";
for (let index = 1; index <= objects.length; index++) {
  pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

fs.writeFileSync("prisma/e2e-multichapter.pdf", Buffer.from(pdf, "latin1"));
console.log("wrote prisma/e2e-multichapter.pdf", Buffer.byteLength(pdf, "latin1"), "bytes");
