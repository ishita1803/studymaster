import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { levelInfo } from "@/lib/gamification";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user.onboarded) redirect("/onboarding");

  const level = levelInfo(user.xp);

  return (
    <AppShell
      user={{
        name: user.name,
        email: user.email,
        streak: user.streak,
        level: level.level,
        progress: level.progress,
        nextXp: level.nextXp,
      }}
      aiEnabled={Boolean(process.env.GEMINI_API_KEY?.trim())}
    >
      {children}
    </AppShell>
  );
}
