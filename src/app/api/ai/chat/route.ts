import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { aiEnabled, streamText } from "@/lib/ai/gemini";
import { demoChatReply, localChatReplyForNote } from "@/lib/ai/study-tools";
import { getWeakTopics } from "@/lib/analytics";
import { evaluateAchievements } from "@/lib/gamification";
import { daysBetween, startOfDay } from "@/lib/utils";

type IncomingMessage = { role: "user" | "assistant"; content: string };

const SYSTEM = [
  "You are Nova, a warm and encouraging study tutor inside a study-planner app.",
  "You know the student's subjects, upcoming exams, weak topics and today's plan (provided below).",
  "Be accurate, concrete and friendly. Use simple language and short paragraphs.",
  "If the student asks for the answer to a problem, give a hint first, then the method, then the answer.",
  "Never invent facts. If you are unsure, say so and suggest how to check.",
  "Keep answers focused: under ~250 words unless asked for detail. Markdown is welcome.",
].join(" ");

function sanitize(messages: unknown): IncomingMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(
      (message): message is IncomingMessage =>
        Boolean(message) &&
        typeof message === "object" &&
        (message as IncomingMessage).role !== undefined &&
        ["user", "assistant"].includes((message as IncomingMessage).role) &&
        typeof (message as IncomingMessage).content === "string",
    )
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 4000),
    }))
    .slice(-12);
}

async function buildContext(userId: string, studentName: string) {
  const today = startOfDay();
  const [user, subjects, todayPlan, weakTopics, dueCards, recentAttempts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, dailyStudyHours: true, streak: true },
    }),
    prisma.subject.findMany({
      where: { userId },
      include: { topics: { select: { name: true, status: true, masteryScore: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.planDay.findUnique({
      where: { userId_date: { userId, date: today } },
      include: { items: { orderBy: { order: "asc" } } },
    }),
    getWeakTopics(userId),
    prisma.flashcard.count({ where: { userId, dueAt: { lte: new Date() } } }),
    prisma.quizAttempt.findMany({
      where: { userId, submittedAt: { not: null } },
      orderBy: { submittedAt: "desc" },
      take: 3,
      include: { quiz: { select: { title: true } } },
    }),
  ]);

  const lines: string[] = [];
  lines.push(`Student name: ${user?.name ?? studentName}`);
  lines.push(`Daily study goal: ${Math.round((user?.dailyStudyHours ?? 2) * 60)} minutes`);
  lines.push(`Current streak: ${user?.streak ?? 0} days`);

  if (subjects.length > 0) {
    lines.push("", "Subjects and topics:");
    for (const subject of subjects) {
      const exam = subject.examDate
        ? ` | exam in ${Math.max(0, daysBetween(today, subject.examDate))} days`
        : "";
      lines.push(
        `- ${subject.name}${exam}: ${
          subject.topics
            .map((topic) => `${topic.name} (${topic.status}, mastery ${Math.round(topic.masteryScore)})`)
            .join("; ") || "no topics yet"
        }`,
      );
    }
  }

  if (todayPlan?.items.length) {
    lines.push("", "Today's plan:");
    for (const item of todayPlan.items) {
      lines.push(
        `- ${item.title} (${item.minutes} min, ${item.kind})${item.completed ? " — done" : ""}`,
      );
    }
  }

  if (weakTopics.length > 0) {
    lines.push("", "Weak topics (low quiz accuracy):");
    for (const topic of weakTopics.slice(0, 5)) {
      lines.push(`- ${topic.subjectName} · ${topic.topicName}: ${topic.accuracy}% accuracy`);
    }
  }

  if (recentAttempts.length > 0) {
    lines.push("", "Recent quiz scores:");
    for (const attempt of recentAttempts) {
      lines.push(`- ${attempt.quiz.title}: ${Math.round(attempt.score)}%`);
    }
  }

  if (dueCards > 0) {
    lines.push("", `${dueCards} flashcards are due for review today.`);
  }

  return { context: lines.join("\n"), studentName: user?.name?.split(" ")[0] ?? studentName };
}

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { messages?: unknown };
  try {
    body = (await request.json()) as { messages?: unknown };
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const messages = sanitize(body.messages);
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUser || !lastUser.content.trim()) {
    return new Response("No question provided", { status: 400 });
  }

  const { context, studentName } = await buildContext(userId, "friend");

  await prisma.aiMessage.create({
    data: { userId, role: "user", content: lastUser.content.slice(0, 4000) },
  });

  const conversation = messages
    .map((message) => `${message.role === "user" ? "Student" : "Nova"}: ${message.content}`)
    .join("\n\n");

  const prompt = [
    "Here is what you know about this student:",
    context,
    "",
    "Conversation so far:",
    conversation,
    "",
    "Reply to the student's latest message.",
  ].join("\n");

  const encoder = new TextEncoder();
  let full = "";

  const stream = new ReadableStream({
    async start(controller) {
      const push = (text: string) => {
        full += text;
        controller.enqueue(encoder.encode(text));
      };

      try {
        if (aiEnabled()) {
          let received = false;
          for await (const chunk of streamText(prompt, SYSTEM)) {
            received = true;
            push(chunk);
          }
          if (!received) {
            push(demoChatReply(lastUser.content, studentName));
          }
        } else {
          const notes = await prisma.note.findMany({
            where: { userId },
            orderBy: { updatedAt: "desc" },
            take: 2,
            select: { title: true, content: true },
          });
          const noteText = notes.map((note) => `${note.title}\n${note.content}`);
          const reply =
            /note|summar|revis|studied today/i.test(lastUser.content) && noteText.length > 0
              ? localChatReplyForNote(lastUser.content, noteText)
              : demoChatReply(lastUser.content, studentName);

          // Small typewriter effect so the demo feels alive.
          for (const token of reply.match(/[\s\S]{1,12}/g) ?? [reply]) {
            push(token);
            await new Promise((resolve) => setTimeout(resolve, 8));
          }
        }
      } catch (error) {
        console.error("[nova] chat stream failed:", error);
        push("\n\nI hit a snag reaching the tutor. Try again in a moment?");
      }

      if (full.trim()) {
        await prisma.aiMessage.create({
          data: { userId, role: "assistant", content: full.slice(0, 8000) },
        });
      }

      await evaluateAchievements(userId).catch(() => []);
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
