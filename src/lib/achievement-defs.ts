export type AchievementDef = {
  code: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    code: "first_focus",
    title: "First Spark",
    description: "Complete your first focus session.",
    icon: "timer",
    xpReward: 20,
  },
  {
    code: "focus_10",
    title: "Deep Diver",
    description: "Complete 10 focus sessions.",
    icon: "waves",
    xpReward: 50,
  },
  {
    code: "minutes_500",
    title: "500 Club",
    description: "Log 500 focused minutes.",
    icon: "hourglass",
    xpReward: 75,
  },
  {
    code: "quiz_first",
    title: "Brave First Try",
    description: "Finish your first quiz.",
    icon: "pencil",
    xpReward: 25,
  },
  {
    code: "perfect_quiz",
    title: "Flawless",
    description: "Score 100% on a quiz.",
    icon: "star",
    xpReward: 60,
  },
  {
    code: "streak_7",
    title: "Seven Sunrises",
    description: "Keep a 7-day study streak.",
    icon: "flame",
    xpReward: 80,
  },
  {
    code: "cards_50",
    title: "Card Shark",
    description: "Review 50 flashcards.",
    icon: "layers",
    xpReward: 50,
  },
  {
    code: "topics_10",
    title: "Topic Tamer",
    description: "Master 10 topics.",
    icon: "check",
    xpReward: 90,
  },
  {
    code: "notes_5",
    title: "Note Keeper",
    description: "Write 5 study notes.",
    icon: "notebook",
    xpReward: 30,
  },
  {
    code: "plan_20",
    title: "Plan Crusher",
    description: "Complete 20 planned study blocks.",
    icon: "calendar",
    xpReward: 70,
  },
  {
    code: "level_5",
    title: "Rising Star",
    description: "Reach level 5.",
    icon: "sparkles",
    xpReward: 100,
  },
  {
    code: "ai_10",
    title: "Curious Mind",
    description: "Ask Nova 10 questions.",
    icon: "bot",
    xpReward: 40,
  },
];

export const ACHIEVEMENT_BY_CODE = new Map(ACHIEVEMENTS.map((a) => [a.code, a]));
