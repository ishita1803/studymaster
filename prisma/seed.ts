/**
 * Demo seed for StudyMaster.
 *
 * Creates one realistic account with a syllabus, a generated roadmap,
 * two weeks of focus history, quizzes with attempts, a flashcard deck,
 * notes, AI history, daily goals and badges.
 *
 * Run with: npm run db:seed
 * Login:    demo@studymaster.app / demo1234
 */
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { ACHIEVEMENTS } from "../src/lib/achievement-defs";
import { evaluateAchievements, XP_RULES } from "../src/lib/gamification";
import { generatePlanForUser } from "../src/lib/plan-service";
import { isAnswerCorrect } from "../src/lib/quiz";
import { addDays, startOfDay } from "../src/lib/utils";

const DEMO_EMAIL = "demo@studymaster.app";
const DEMO_PASSWORD = "demo1234";
/** Older demo addresses are cleaned up so only one demo account remains. */
const LEGACY_DEMO_EMAILS = ["demo@nova.study"];

type TopicSpec = {
  name: string;
  difficulty: number;
  importance: number;
  estimatedMinutes: number;
  status: string;
  masteryScore: number;
  studiedDaysAgo: number | null;
};

type SubjectSpec = {
  name: string;
  color: string;
  examInDays: number | null;
  importance: number;
  difficulty: number;
  prepLevel: string;
  topics: TopicSpec[];
};

const SUBJECTS: SubjectSpec[] = [
  {
    name: "Biology",
    color: "mint",
    examInDays: 12,
    importance: 5,
    difficulty: 4,
    prepLevel: "intermediate",
    topics: [
      { name: "Cell division", difficulty: 4, importance: 5, estimatedMinutes: 90, status: "revised", masteryScore: 72, studiedDaysAgo: 2 },
      { name: "Genetics & inheritance", difficulty: 4, importance: 4, estimatedMinutes: 120, status: "studied", masteryScore: 58, studiedDaysAgo: 4 },
      { name: "Human physiology", difficulty: 3, importance: 4, estimatedMinutes: 90, status: "in_progress", masteryScore: 40, studiedDaysAgo: 1 },
      { name: "Ecology", difficulty: 2, importance: 2, estimatedMinutes: 60, status: "mastered", masteryScore: 92, studiedDaysAgo: 6 },
      { name: "Photosynthesis", difficulty: 3, importance: 4, estimatedMinutes: 75, status: "not_started", masteryScore: 0, studiedDaysAgo: null },
    ],
  },
  {
    name: "Chemistry",
    color: "violet",
    examInDays: 20,
    importance: 4,
    difficulty: 4,
    prepLevel: "beginner",
    topics: [
      { name: "Chemical bonding", difficulty: 4, importance: 4, estimatedMinutes: 80, status: "studied", masteryScore: 65, studiedDaysAgo: 3 },
      { name: "Organic reactions", difficulty: 5, importance: 5, estimatedMinutes: 120, status: "in_progress", masteryScore: 35, studiedDaysAgo: 1 },
      { name: "Acids & bases", difficulty: 3, importance: 3, estimatedMinutes: 60, status: "revised", masteryScore: 78, studiedDaysAgo: 5 },
      { name: "Thermodynamics", difficulty: 4, importance: 4, estimatedMinutes: 90, status: "not_started", masteryScore: 0, studiedDaysAgo: null },
    ],
  },
  {
    name: "Mathematics",
    color: "sky",
    examInDays: 5,
    importance: 5,
    difficulty: 5,
    prepLevel: "beginner",
    topics: [
      { name: "Quadratic equations", difficulty: 3, importance: 5, estimatedMinutes: 90, status: "studied", masteryScore: 55, studiedDaysAgo: 2 },
      { name: "Trigonometry", difficulty: 4, importance: 5, estimatedMinutes: 100, status: "in_progress", masteryScore: 30, studiedDaysAgo: 1 },
      { name: "Probability", difficulty: 4, importance: 4, estimatedMinutes: 80, status: "not_started", masteryScore: 0, studiedDaysAgo: null },
      { name: "Calculus basics", difficulty: 5, importance: 4, estimatedMinutes: 120, status: "not_started", masteryScore: 0, studiedDaysAgo: null },
    ],
  },
  {
    name: "History",
    color: "amber",
    examInDays: null,
    importance: 3,
    difficulty: 2,
    prepLevel: "advanced",
    topics: [
      { name: "Industrial revolution", difficulty: 2, importance: 3, estimatedMinutes: 60, status: "mastered", masteryScore: 88, studiedDaysAgo: 7 },
      { name: "The Cold War", difficulty: 3, importance: 3, estimatedMinutes: 70, status: "revised", masteryScore: 80, studiedDaysAgo: 4 },
      { name: "World War I", difficulty: 3, importance: 3, estimatedMinutes: 65, status: "studied", masteryScore: 62, studiedDaysAgo: 8 },
    ],
  },
];

const FOCUS_SESSIONS = [
  { minutes: 45, daysAgo: 13, hour: 18 },
  { minutes: 50, daysAgo: 13, hour: 9 },
  { minutes: 40, daysAgo: 12, hour: 19 },
  { minutes: 55, daysAgo: 12, hour: 10 },
  { minutes: 45, daysAgo: 11, hour: 18 },
  { minutes: 30, daysAgo: 10, hour: 20 },
  { minutes: 50, daysAgo: 10, hour: 8 },
  { minutes: 40, daysAgo: 9, hour: 17 },
  { minutes: 60, daysAgo: 8, hour: 19 },
  { minutes: 45, daysAgo: 8, hour: 11 },
  { minutes: 50, daysAgo: 7, hour: 18 },
  { minutes: 40, daysAgo: 6, hour: 20 },
  { minutes: 35, daysAgo: 5, hour: 17 },
  { minutes: 55, daysAgo: 5, hour: 9 },
  { minutes: 45, daysAgo: 4, hour: 19 },
  { minutes: 50, daysAgo: 3, hour: 18 },
  { minutes: 40, daysAgo: 2, hour: 20 },
  { minutes: 45, daysAgo: 2, hour: 10 },
  { minutes: 60, daysAgo: 1, hour: 17 },
  { minutes: 25, daysAgo: 0, hour: 9 },
];

type QuizSpec = {
  title: string;
  description: string;
  subjectName: string;
  topicName: string | null;
  source: string;
  timeLimitSec: number | null;
  questions: {
    type: "mcq" | "truefalse" | "short";
    prompt: string;
    options?: string[];
    correctAnswer: string;
    explanation?: string;
  }[];
};

const QUIZZES: QuizSpec[] = [
  {
    title: "Cell division checkpoint",
    description: "Mitosis, meiosis and the phases in between.",
    subjectName: "Biology",
    topicName: "Cell division",
    source: "ai",
    timeLimitSec: 600,
    questions: [
      {
        type: "mcq",
        prompt: "What is the main purpose of mitosis?",
        options: [
          "Produce gametes",
          "Produce genetically identical body cells",
          "Create genetic variation",
          "Repair DNA only",
        ],
        correctAnswer: "Produce genetically identical body cells",
        explanation:
          "Mitosis produces two daughter cells with the same chromosome number as the parent cell — useful for growth and repair.",
      },
      {
        type: "truefalse",
        prompt: "Meiosis produces four haploid cells.",
        options: ["True", "False"],
        correctAnswer: "True",
        explanation: "Two rounds of division after one replication give four haploid daughter cells.",
      },
      {
        type: "mcq",
        prompt: "During which phase do chromosomes line up at the cell equator?",
        options: ["Prophase", "Metaphase", "Anaphase", "Telophase"],
        correctAnswer: "Metaphase",
        explanation: "Spindle fibres attach at the centromeres and align chromosomes on the metaphase plate.",
      },
      {
        type: "short",
        prompt: "What is the name of the process where the cytoplasm divides?",
        correctAnswer: "Cytokinesis",
        explanation: "Cytokinesis follows nuclear division and splits the cytoplasm into two cells.",
      },
      {
        type: "mcq",
        prompt: "Which process creates genetic variation during meiosis?",
        options: [
          "Mitosis",
          "Binary fission",
          "Crossing over during prophase I",
          "DNA replication",
        ],
        correctAnswer: "Crossing over during prophase I",
        explanation: "Homologous chromosomes exchange sections, shuffling alleles before they separate.",
      },
    ],
  },
  {
    title: "Quadratic equations drill",
    description: "Factorising, roots and the discriminant.",
    subjectName: "Mathematics",
    topicName: "Quadratic equations",
    source: "manual",
    timeLimitSec: null,
    questions: [
      {
        type: "mcq",
        prompt: "Factorise x² − 5x + 6.",
        options: ["(x − 2)(x − 3)", "(x + 2)(x + 3)", "(x − 1)(x − 6)", "(x − 2)(x + 3)"],
        correctAnswer: "(x − 2)(x − 3)",
        explanation: "The numbers must multiply to 6 and add to −5: that is −2 and −3.",
      },
      {
        type: "mcq",
        prompt: "What are the roots of x² − 4 = 0?",
        options: ["2 only", "−2 only", "±2", "±4"],
        correctAnswer: "±2",
        explanation: "x² = 4, so x = 2 or x = −2.",
      },
      {
        type: "short",
        prompt: "What is the discriminant of ax² + bx + c = 0?",
        correctAnswer: "b² - 4ac",
        explanation: "The discriminant decides how many real roots the equation has.",
      },
      {
        type: "truefalse",
        prompt: "If the discriminant is negative, the quadratic has two real roots.",
        options: ["True", "False"],
        correctAnswer: "False",
        explanation: "A negative discriminant means no real roots — the parabola never crosses the x-axis.",
      },
      {
        type: "mcq",
        prompt: "Complete the square for x² + 6x.",
        options: ["(x + 3)² − 9", "(x + 3)² + 9", "(x − 3)² − 9", "(x + 6)²"],
        correctAnswer: "(x + 3)² − 9",
        explanation: "Half of 6 is 3; squaring gives 9, which must be subtracted to keep the expression equal.",
      },
    ],
  },
  {
    title: "Chemical bonding quick check",
    description: "Covalent, ionic and molecular shapes.",
    subjectName: "Chemistry",
    topicName: "Chemical bonding",
    source: "notes",
    timeLimitSec: 300,
    questions: [
      {
        type: "mcq",
        prompt: "Which bond involves sharing pairs of electrons?",
        options: ["Ionic", "Covalent", "Metallic", "Hydrogen"],
        correctAnswer: "Covalent",
        explanation: "Covalent bonds form when atoms share electron pairs.",
      },
      {
        type: "truefalse",
        prompt: "Ionic bonds usually form between metals and non-metals.",
        options: ["True", "False"],
        correctAnswer: "True",
        explanation: "Metals lose electrons and non-metals gain them, creating oppositely charged ions.",
      },
      {
        type: "mcq",
        prompt: "What is the shape of a methane (CH₄) molecule?",
        options: ["Linear", "Trigonal planar", "Tetrahedral", "Bent"],
        correctAnswer: "Tetrahedral",
        explanation: "Four bonding pairs repel equally, giving bond angles of about 109.5°.",
      },
      {
        type: "short",
        prompt: "What force holds an ionic lattice together?",
        correctAnswer: "Electrostatic attraction",
        explanation: "Oppositely charged ions attract each other in every direction, forming a giant lattice.",
      },
    ],
  },
];

type CardSpec = {
  subjectName: string;
  topicName: string | null;
  front: string;
  back: string;
  reps: number;
  intervalDays: number;
  dueInDays: number;
  source: string;
};

const CARDS: CardSpec[] = [
  { subjectName: "Biology", topicName: "Cell division", front: "What is the difference between mitosis and meiosis?", back: "Mitosis makes two identical diploid cells for growth and repair. Meiosis makes four genetically different haploid gametes.", reps: 10, intervalDays: 30, dueInDays: 12, source: "ai" },
  { subjectName: "Biology", topicName: "Cell division", front: "Which phase of mitosis comes right after metaphase?", back: "Anaphase — sister chromatids are pulled to opposite poles.", reps: 8, intervalDays: 21, dueInDays: 6, source: "ai" },
  { subjectName: "Biology", topicName: "Genetics & inheritance", front: "What is a genotype?", back: "The combination of alleles an organism carries, such as AA, Aa or aa.", reps: 3, intervalDays: 4, dueInDays: 1, source: "manual" },
  { subjectName: "Biology", topicName: "Photosynthesis", front: "Write the word equation for photosynthesis.", back: "Carbon dioxide + water → glucose + oxygen, using light energy and chlorophyll.", reps: 0, intervalDays: 0, dueInDays: 0, source: "manual" },
  { subjectName: "Biology", topicName: "Human physiology", front: "What is the main function of red blood cells?", back: "Carry oxygen from the lungs to body tissues using haemoglobin.", reps: 2, intervalDays: 3, dueInDays: 0, source: "manual" },
  { subjectName: "Chemistry", topicName: "Chemical bonding", front: "Covalent bond = ______ of electron pairs.", back: "Sharing.", reps: 9, intervalDays: 25, dueInDays: 9, source: "ai" },
  { subjectName: "Chemistry", topicName: "Chemical bonding", front: "Why do ionic compounds conduct electricity when molten?", back: "Their ions become free to move and carry charge.", reps: 3, intervalDays: 4, dueInDays: 2, source: "ai" },
  { subjectName: "Chemistry", topicName: "Acids & bases", front: "What is the pH of a neutral solution at 25 °C?", back: "pH 7.", reps: 11, intervalDays: 45, dueInDays: 20, source: "manual" },
  { subjectName: "Chemistry", topicName: "Organic reactions", front: "What is a substitution reaction?", back: "One atom or group is replaced by another, as in alkanes reacting with halogens.", reps: 1, intervalDays: 1, dueInDays: 0, source: "notes" },
  { subjectName: "Mathematics", topicName: "Quadratic equations", front: "Formula for the roots of ax² + bx + c = 0", back: "x = (−b ± √(b² − 4ac)) / 2a.", reps: 12, intervalDays: 40, dueInDays: 15, source: "manual" },
  { subjectName: "Mathematics", topicName: "Quadratic equations", front: "What does a negative discriminant tell you?", back: "There are no real roots; the graph does not cross the x-axis.", reps: 2, intervalDays: 3, dueInDays: 0, source: "ai" },
  { subjectName: "Mathematics", topicName: "Trigonometry", front: "State the sine rule.", back: "a / sin A = b / sin B = c / sin C.", reps: 1, intervalDays: 1, dueInDays: 0, source: "manual" },
  { subjectName: "Mathematics", topicName: "Probability", front: "What is the probability of an impossible event?", back: "0. Certain events have probability 1.", reps: 8, intervalDays: 21, dueInDays: 4, source: "manual" },
  { subjectName: "History", topicName: "The Cold War", front: "What was the Marshall Plan?", back: "A US programme that funded Western European recovery after World War II, partly to contain communism.", reps: 4, intervalDays: 7, dueInDays: 3, source: "notes" },
];

const NOTES = [
  {
    subjectName: "Biology",
    title: "Cell division — mitosis vs meiosis",
    content: `Mitosis is the process of nuclear division that produces two genetically identical daughter cells. It is used for growth, repair and asexual reproduction.

The stages are prophase, metaphase, anaphase and telophase, followed by cytokinesis. In prophase the chromosomes condense and the nuclear envelope breaks down. In metaphase chromosomes line up along the equator. In anaphase sister chromatids are pulled to opposite poles. In telophase two new nuclei form.

Meiosis happens in germ cells and involves two divisions. It produces four haploid cells, each genetically different. Crossing over in prophase I and independent assortment in metaphase I create variation.

Exam takeaway: mitosis = identical + diploid; meiosis = variation + haploid.`,
  },
  {
    subjectName: "Chemistry",
    title: "Chemical bonding summary",
    content: `Ionic bonding happens between metals and non-metals. Electrons are transferred, producing positive and negative ions. The ions form a giant lattice held together by strong electrostatic attraction. Ionic compounds have high melting points and conduct electricity when molten or dissolved.

Covalent bonding happens between non-metals. Atoms share pairs of electrons. Simple molecular substances have weak intermolecular forces, so they have low melting points. Giant covalent structures such as diamond have very high melting points.

Metallic bonding involves a lattice of positive ions surrounded by delocalised electrons, which explains why metals conduct heat and electricity.

Shapes: methane is tetrahedral (109.5°), ammonia is trigonal pyramidal, water is bent.`,
  },
  {
    subjectName: "Mathematics",
    title: "Quadratic equations — methods",
    content: `A quadratic equation has the form ax² + bx + c = 0, where a ≠ 0.

Factorising works when the expression splits into two brackets. For x² − 5x + 6, find two numbers that multiply to 6 and add to −5: −2 and −3, so (x − 2)(x − 3).

The quadratic formula always works: x = (−b ± √(b² − 4ac)) / 2a. The discriminant b² − 4ac tells you how many real roots exist. Positive: two real roots. Zero: one repeated root. Negative: no real roots.

Completing the square rewrites the expression as (x + p)² + q. It is useful for finding the turning point of the graph.

Always check by substituting your roots back into the original equation.`,
  },
  {
    subjectName: "History",
    title: "Cold War causes and turning points",
    content: `The Cold War was a period of geopolitical tension between the United States and the Soviet Union after 1945.

Key causes: ideological differences between capitalism and communism, the power vacuum in post-war Europe, the atomic bomb, and mutual distrust at the Yalta and Potsdam conferences.

Turning points: the Berlin Blockade and Airlift (1948–49), the formation of NATO (1949) and the Warsaw Pact (1955), the Cuban Missile Crisis (1962), and the era of détente in the 1970s.

The Berlin Wall fell in 1989 and the Soviet Union dissolved in 1991.`,
  },
  {
    subjectName: null,
    title: "How I study best",
    content: `What works: 40-minute focus blocks with a 5-minute break, phone in another room, and one clear topic per block.

What does not work: re-reading notes for hours, starting with the easiest subject, and leaving flashcards until the night before.

Next experiment: do five minutes of flashcard review before starting new material, then a short quiz at the end of each week.

Reminder: a low quiz score is information, not a verdict.`,
  },
];

const AI_HISTORY: { role: "user" | "assistant"; content: string; daysAgo: number }[] = [
  { role: "user", content: "Can you explain the difference between mitosis and meiosis in simple terms?", daysAgo: 6 },
  { role: "assistant", content: "Think of mitosis as copying a document: one cell becomes two identical cells. Meiosis is more like shuffling a deck and dealing four hands — it produces four cells, each with half the chromosomes and a different mix of genes. Mitosis is for growth and repair; meiosis is for making gametes.", daysAgo: 6 },
  { role: "user", content: "Give me a hint for factorising x² − 5x + 6 without telling me the answer.", daysAgo: 5 },
  { role: "assistant", content: "Look for two numbers that multiply to the constant term (+6) and add to the coefficient of x (−5). Write down the factor pairs of 6 first, then check which pair adds to −5.", daysAgo: 5 },
  { role: "user", content: "What should I revise first for my maths exam in five days?", daysAgo: 4 },
  { role: "assistant", content: "Start with the topic you scored lowest on in practice: quadratic equations. Do a 25-minute review of the discriminant and completing the square, then take the five-question drill again. After that, spend one block on trigonometry before touching new topics.", daysAgo: 4 },
  { role: "user", content: "I keep forgetting the stages of mitosis. Any memory trick?", daysAgo: 3 },
  { role: "assistant", content: "Try PMAT: Prophase, Metaphase, Anaphase, Telophase. Add a picture for each: condense, middle, apart, two nuclei. Then close your notes and write the four stages from memory — retrieval beats re-reading.", daysAgo: 3 },
  { role: "user", content: "Summarise my chemical bonding notes into three key points.", daysAgo: 2 },
  { role: "assistant", content: "1) Ionic bonds transfer electrons between metals and non-metals, forming lattices with high melting points. 2) Covalent bonds share electron pairs between non-metals; simple molecules have weak intermolecular forces. 3) Metallic bonds have delocalised electrons, which explains conduction. Shapes follow electron-pair repulsion — methane is tetrahedral.", daysAgo: 2 },
  { role: "user", content: "How do I stop leaving revision until the night before?", daysAgo: 1 },
  { role: "assistant", content: "Make the first step tiny and scheduled: one 15-minute block right after a meal, with a specific topic named in advance. Put it in your roadmap so it becomes a checkbox rather than a decision. The goal is not a perfect week — it is never having a zero day.", daysAgo: 1 },
  { role: "user", content: "Quiz me on the discriminant.", daysAgo: 0 },
  { role: "assistant", content: "Quick check: for x² + 4x + 5 = 0, what is the discriminant, and how many real roots does the equation have? Hint: b² − 4ac with a = 1, b = 4, c = 5.", daysAgo: 0 },
];

async function main() {
  console.log("✦ Seeding StudyMaster…");

  for (const achievement of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { code: achievement.code },
      create: achievement,
      update: achievement,
    });
  }

  const existing = await prisma.user.findMany({
    where: { email: { in: [DEMO_EMAIL, ...LEGACY_DEMO_EMAILS] } },
    select: { id: true },
  });
  if (existing.length > 0) {
    console.log("   removing previous demo account…");
    await prisma.user.deleteMany({ where: { id: { in: existing.map((user) => user.id) } } });
  }

  const today = startOfDay();
  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: "Aarav Sharma",
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
      onboarded: true,
      dailyStudyHours: 2,
      studyStartTime: "18:00",
      reminderEnabled: true,
      streak: 8,
      longestStreak: 11,
      lastActiveDate: today,
    },
  });

  let xpTotal = 0;
  async function addXp(action: string, amount: number, createdAt: Date, refId?: string) {
    if (amount <= 0) return;
    xpTotal += amount;
    await prisma.xpEvent.create({
      data: { userId: user.id, action, amount, createdAt, refId },
    });
  }

  // ---------------------------------------------------------------- syllabus
  const subjectIds = new Map<string, string>();
  const topicIds = new Map<string, string>();
  const allTopics: { id: string; subjectId: string; subjectName: string; name: string }[] = [];

  for (const spec of SUBJECTS) {
    const subject = await prisma.subject.create({
      data: {
        userId: user.id,
        name: spec.name,
        color: spec.color,
        importance: spec.importance,
        difficulty: spec.difficulty,
        prepLevel: spec.prepLevel,
        examDate: spec.examInDays === null ? null : addDays(today, spec.examInDays),
        createdAt: addDays(today, -30),
      },
    });
    subjectIds.set(spec.name, subject.id);

    if (spec.examInDays !== null) {
      const examDate = addDays(today, spec.examInDays);
      await prisma.exam.create({
        data: {
          userId: user.id,
          subjectId: subject.id,
          name: `${spec.name} exam`,
          date: examDate,
          importance: spec.importance,
          difficulty: spec.difficulty,
          prepLevel: spec.prepLevel,
        },
      });

      // One subject also has a mock test, so the planner UI shows that
      // multiple upcoming tests per subject are supported.
      if (spec.examInDays >= 12) {
        await prisma.exam.create({
          data: {
            userId: user.id,
            subjectId: subject.id,
            name: `${spec.name} mock test`,
            date: addDays(today, Math.max(1, spec.examInDays - 4)),
            importance: Math.min(5, spec.importance),
            difficulty: spec.difficulty,
            prepLevel: spec.prepLevel,
          },
        });
      }
    }

    for (const topic of spec.topics) {
      const created = await prisma.topic.create({
        data: {
          userId: user.id,
          subjectId: subject.id,
          name: topic.name,
          chapter: `${spec.name} · core`,
          kind: "topic",
          difficulty: topic.difficulty,
          importance: topic.importance,
          estimatedMinutes: topic.estimatedMinutes,
          status: topic.status,
          masteryScore: topic.masteryScore,
          lastStudiedAt:
            topic.studiedDaysAgo === null ? null : addDays(today, -topic.studiedDaysAgo),
          createdAt: addDays(today, -25),
        },
      });
      topicIds.set(`${spec.name}::${topic.name}`, created.id);
      allTopics.push({
        id: created.id,
        subjectId: subject.id,
        subjectName: spec.name,
        name: topic.name,
      });
    }
  }

  // ------------------------------------------------------------ focus history
  const studyTopics = allTopics.filter((topic) => !topic.name.startsWith("Thermodynamics"));
  for (const [index, session] of FOCUS_SESSIONS.entries()) {
    const topic = studyTopics[index % studyTopics.length];
    const startedAt = addDays(today, -session.daysAgo);
    startedAt.setHours(session.hour, 15, 0, 0);
    const endedAt = new Date(startedAt.getTime() + session.minutes * 60_000);

    await prisma.focusSession.create({
      data: {
        userId: user.id,
        subjectId: topic.subjectId,
        topicId: topic.id,
        label: `${topic.subjectName} · ${topic.name}`,
        plannedMinutes: session.minutes,
        focusSeconds: session.minutes * 60,
        completed: true,
        startedAt,
        endedAt,
      },
    });

    await addXp("focus", XP_RULES.focus(session.minutes), endedAt);
  }

  // -------------------------------------------------------------- roadmap
  const planResult = await generatePlanForUser(user.id, {
    startDate: addDays(today, -8),
    horizonDays: 30,
    dailyMinutes: 120,
  });
  console.log(`   generated ${planResult.items} plan blocks across ${planResult.days} days`);

  const planDays = await prisma.planDay.findMany({
    where: { userId: user.id },
    include: { items: { orderBy: { order: "asc" } } },
    orderBy: { date: "asc" },
  });

  const completedItemIds: string[] = [];
  for (const day of planDays) {
    const dayKey = startOfDay(day.date);
    if (dayKey < today) {
      completedItemIds.push(...day.items.map((item) => item.id));
    } else if (dayKey.getTime() === today.getTime()) {
      completedItemIds.push(...day.items.slice(0, 2).map((item) => item.id));
    }
  }

  if (completedItemIds.length > 0) {
    await prisma.planItem.updateMany({
      where: { id: { in: completedItemIds } },
      data: { completed: true, completedAt: new Date() },
    });
    for (const _ of completedItemIds) {
      await addXp("plan_item", XP_RULES.planItem, addDays(today, -1));
    }
  }

  // ---------------------------------------------------------------- quizzes
  for (const spec of QUIZZES) {
    const quiz = await prisma.quiz.create({
      data: {
        userId: user.id,
        subjectId: subjectIds.get(spec.subjectName) ?? null,
        topicId: spec.topicName
          ? topicIds.get(`${spec.subjectName}::${spec.topicName}`) ?? null
          : null,
        title: spec.title,
        description: spec.description,
        source: spec.source,
        timeLimitSec: spec.timeLimitSec,
        createdAt: addDays(today, -10),
        questions: {
          create: spec.questions.map((question, order) => ({
            type: question.type,
            prompt: question.prompt,
            options: JSON.stringify(question.options ?? []),
            correctAnswer: question.correctAnswer,
            explanation: question.explanation ?? "",
            points: 1,
            order,
          })),
        },
      },
      include: { questions: { orderBy: { order: "asc" } } },
    });

    const attemptsByTitle: Record<
      string,
      { daysAgo: number; minutes: number; responses: Record<number, string> }[]
    > = {
      "Cell division checkpoint": [
        {
          daysAgo: 4,
          minutes: 7,
          responses: {
            0: "Produce genetically identical body cells",
            1: "True",
            2: "Anaphase",
            3: "Osmosis",
            4: "Crossing over during prophase I",
          },
        },
        {
          daysAgo: 1,
          minutes: 6,
          responses: {
            0: "Produce genetically identical body cells",
            1: "True",
            2: "Prophase",
            3: "Cytokinesis",
            4: "Crossing over during prophase I",
          },
        },
      ],
      "Quadratic equations drill": [
        {
          daysAgo: 2,
          minutes: 9,
          responses: {
            0: "(x + 2)(x + 3)",
            1: "±2",
            2: "b² + 4ac",
            3: "False",
            4: "(x + 3)² + 9",
          },
        },
      ],
      "Chemical bonding quick check": [
        {
          daysAgo: 3,
          minutes: 4,
          responses: {
            0: "Covalent",
            1: "True",
            2: "Tetrahedral",
            3: "Electrostatic attraction",
          },
        },
      ],
    };

    for (const attemptSpec of attemptsByTitle[spec.title] ?? []) {
      const submittedAt = addDays(today, -attemptSpec.daysAgo);
      submittedAt.setHours(20, 0, 0, 0);
      const startedAt = new Date(submittedAt.getTime() - attemptSpec.minutes * 60_000);

      const answers = quiz.questions.map((question, index) => {
        const response = attemptSpec.responses[index] ?? "";
        const correct = isAnswerCorrect(question.type, question.correctAnswer, response);
        return {
          questionId: question.id,
          response,
          isCorrect: correct,
          awardedPoints: correct ? question.points : 0,
        };
      });
      const correctCount = answers.filter((answer) => answer.isCorrect).length;
      const score = Math.round((correctCount / quiz.questions.length) * 100);

      await prisma.quizAttempt.create({
        data: {
          quizId: quiz.id,
          userId: user.id,
          startedAt,
          submittedAt,
          score,
          maxScore: 100,
          timeSpentSec: attemptSpec.minutes * 60,
          answers: { create: answers },
        },
      });

      await addXp("quiz", XP_RULES.quiz, submittedAt);
      if (score >= 100) await addXp("perfect_quiz", XP_RULES.perfectQuiz, submittedAt);
    }
  }

  // ------------------------------------------------------------- flashcards
  let totalReviews = 0;
  for (const spec of CARDS) {
    const dueAt = addDays(today, spec.dueInDays);
    dueAt.setHours(8, 0, 0, 0);

    const card = await prisma.flashcard.create({
      data: {
        userId: user.id,
        subjectId: subjectIds.get(spec.subjectName) ?? null,
        topicId: spec.topicName
          ? topicIds.get(`${spec.subjectName}::${spec.topicName}`) ?? null
          : null,
        front: spec.front,
        back: spec.back,
        source: spec.source,
        ease: Math.round((2.3 + (spec.reps % 5) * 0.1) * 100) / 100,
        intervalDays: spec.intervalDays,
        repetitions: spec.reps,
        lapses: spec.reps > 5 ? 1 : 0,
        dueAt,
        lastRating: spec.reps > 0 ? (spec.reps % 3 === 0 ? "hard" : spec.reps % 2 === 0 ? "easy" : "medium") : null,
        lastReviewedAt: spec.reps > 0 ? addDays(today, -Math.min(7, spec.reps)) : null,
        createdAt: addDays(today, -20),
      },
    });

    for (let index = 0; index < spec.reps; index++) {
      const reviewedAt = addDays(today, -(spec.reps - index) * 2);
      reviewedAt.setHours(19, 30, 0, 0);
      await prisma.flashcardReview.create({
        data: {
          cardId: card.id,
          userId: user.id,
          rating: index % 4 === 0 ? "hard" : index % 3 === 0 ? "medium" : "easy",
          reviewedAt,
          nextDueAt: dueAt,
        },
      });
      totalReviews += 1;
    }
  }
  await addXp("flashcard", totalReviews * XP_RULES.flashcard, addDays(today, -1));

  // ------------------------------------------------------------------ notes
  for (const note of NOTES) {
    await prisma.note.create({
      data: {
        userId: user.id,
        subjectId: note.subjectName ? subjectIds.get(note.subjectName) ?? null : null,
        title: note.title,
        content: note.content,
        createdAt: addDays(today, -9),
        updatedAt: addDays(today, -2),
      },
    });
  }

  // -------------------------------------------------------------- AI history
  for (const message of AI_HISTORY) {
    const createdAt = addDays(today, -message.daysAgo);
    createdAt.setHours(21, 10, 0, 0);
    await prisma.aiMessage.create({
      data: {
        userId: user.id,
        role: message.role,
        content: message.content,
        createdAt,
      },
    });
  }

  // ----------------------------------------------------------- daily goals
  for (let offset = 8; offset >= 0; offset--) {
    const date = addDays(today, -offset);
    const done = offset > 0;
    await prisma.dailyGoal.create({
      data: {
        userId: user.id,
        date,
        targetMinutes: 120,
        status: done ? "done" : "pending",
        createdAt: date,
      },
    });
    if (done) await addXp("daily_goal", XP_RULES.dailyGoal, addDays(date, 1));
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { xp: xpTotal },
  });

  // Badge rewards add XP, which can itself unlock a level badge. Run the
  // evaluator twice so the seeded account lands in a stable, fully-awarded state.
  const firstPass = await evaluateAchievements(user.id);
  const secondPass = await evaluateAchievements(user.id);
  const earned = [...firstPass, ...secondPass];
  console.log(
    `   awarded ${earned.length} badge${earned.length === 1 ? "" : "s"}: ${
      earned.map((achievement) => achievement.title).join(", ") || "none"
    }`,
  );

  const finalUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  console.log("");
  console.log("✅ Seed complete");
  console.log(`   Email:    ${DEMO_EMAIL}`);
  console.log(`   Password: ${DEMO_PASSWORD}`);
  console.log(`   XP:       ${finalUser.xp.toLocaleString()}`);
  console.log(`   Streak:   ${finalUser.streak} days`);
  console.log(`   Reviews:  ${totalReviews} flashcard reviews`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
