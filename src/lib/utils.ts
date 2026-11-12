import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function startOfDay(date: Date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Local-time YYYY-MM-DD key. */
export function dateKey(date: Date = new Date()) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function daysBetween(from: Date, to: Date) {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatMinutes(totalMinutes: number) {
  const mins = Math.max(0, Math.round(totalMinutes));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatHours(seconds: number) {
  return (seconds / 3600).toFixed(1);
}

export function pct(value: number, total: number) {
  if (!total) return 0;
  return clamp(Math.round((value / total) * 100), 0, 100);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function greeting(date: Date = new Date()) {
  const h = date.getHours();
  if (h < 5) return "Still up?";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
}

export function friendlyDate(date: Date, now: Date = new Date()) {
  const diff = daysBetween(now, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) {
    return date.toLocaleDateString(undefined, { weekday: "long" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function examCountdown(examDate: Date | null, now: Date = new Date()) {
  if (!examDate) return null;
  const days = daysBetween(now, examDate);
  if (days < 0) return { days, label: "Exam passed", urgent: false, past: true };
  if (days === 0) return { days, label: "Exam today", urgent: true, past: false };
  if (days === 1) return { days, label: "Exam tomorrow", urgent: true, past: false };
  return {
    days,
    label: `${days} days to exam`,
    urgent: days <= 7,
    past: false,
  };
}

export function colorVar(color: string) {
  switch (color) {
    case "violet":
      return "#A78BFA";
    case "pink":
      return "#FF8FB1";
    case "amber":
      return "#FFD48A";
    case "sky":
      return "#7DD3FC";
    default:
      return "#5BF0C8";
  }
}

export const SUBJECT_COLORS = ["mint", "violet", "pink", "amber", "sky"] as const;

export function normalizeAnswer(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
