"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  BookOpen,
  BrainCircuit,
  ChartNoAxesColumn,
  ChevronRight,
  Flame,
  Home,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookPen,
  Route,
  Settings,
  Sparkles,
  Timer,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { Nova } from "@/components/nova";
import { AssistantDrawer } from "@/components/assistant-drawer";
import { cn, initials } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/focus", label: "Focus timer", icon: Timer },
  { href: "/roadmap", label: "Roadmap", icon: Route },
  { href: "/quizzes", label: "Quizzes", icon: BrainCircuit },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/notes", label: "Notes & AI", icon: NotebookPen },
  { href: "/subjects", label: "Subjects", icon: BookOpen },
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesColumn },
  { href: "/achievements", label: "Achievements", icon: Trophy },
  { href: "/settings", label: "Settings", icon: Settings },
];

const MOBILE_PRIMARY = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/focus", label: "Focus", icon: Timer },
  { href: "/roadmap", label: "Plan", icon: Route },
  { href: "/flashcards", label: "Cards", icon: Layers },
];

type ShellUser = {
  name: string;
  email: string;
  streak: number;
  level: number;
  progress: number;
  nextXp: number;
};

export function AppShell({
  user,
  aiEnabled,
  children,
}: {
  user: ShellUser;
  aiEnabled: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = NAV.find((item) => isActive(item.href));

  return (
    <div className="min-h-dvh">
      {/* ------------------------------------------------------------- sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-dvh w-[248px] flex-col border-r border-white/8 bg-ink/50 px-4 py-5 backdrop-blur-2xl lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-1">
          <Nova size={38} float={false} />
          <span className="flex flex-col leading-none">
            <span className="display text-xl font-bold tracking-tight text-cream">StudyMaster</span>
            <span className="text-[0.58rem] uppercase tracking-[0.22em] text-muted">
              study planner
            </span>
          </span>
        </Link>

        <nav className="mt-7 flex-1 space-y-1 overflow-y-auto scroll-thin pr-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn("nav-link", isActive(item.href) && "nav-link-active")}
              >
                <Icon size={17} className="shrink-0" />
                <span className="flex-1">{item.label}</span>
                {isActive(item.href) ? (
                  <ChevronRight size={13} className="text-mint" />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 space-y-3">
          <div className="glass card p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-cream">
                <Zap size={13} className="text-mint" />
                Level {user.level}
              </span>
              <span className="text-muted">{user.progress}%</span>
            </div>
            <div className="progress-track mt-2 h-1.5">
              <div className="progress-fill" style={{ width: `${user.progress}%` }} />
            </div>
            <p className="mt-2 text-[0.65rem] text-muted">
              Next level at {user.nextXp.toLocaleString()} XP
            </p>
          </div>

          <button
            type="button"
            onClick={() => setAssistantOpen(true)}
            className="btn btn-primary w-full"
          >
            <Sparkles size={15} />
            Ask Nova
          </button>

          <div className="flex items-center gap-2.5 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-2.5">
            <Link
              href="/settings"
              className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-mint/80 to-violet/80 text-xs font-bold leading-none text-ink"
              aria-label="Open settings"
            >
              {initials(user.name)}
            </Link>
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate text-xs font-semibold text-cream">{user.name}</p>
              <p className="truncate text-[0.62rem] text-muted">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: "/" })}
              className="btn btn-ghost btn-icon h-8 w-8 shrink-0"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------------- topbar */}
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-white/5 bg-ink/55 backdrop-blur-2xl">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <Link href="/dashboard" className="lg:hidden">
                <Nova size={32} float={false} />
              </Link>
              <div>
                <p className="hidden text-[0.62rem] uppercase tracking-[0.18em] text-muted sm:block">
                  {current?.label ?? "StudyMaster"}
                </p>
                <p className="display text-sm font-semibold text-cream sm:text-base">
                  {pathname === "/dashboard" ? "Your study plan" : current?.label ?? "StudyMaster"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="chip chip-amber hidden sm:inline-flex" title="Current streak">
                <Flame size={12} />
                {user.streak} day{user.streak === 1 ? "" : "s"}
              </span>
              <span className="chip chip-violet hidden md:inline-flex">
                <Zap size={12} />
                Lv {user.level}
              </span>
              <button
                type="button"
                onClick={() => setAssistantOpen(true)}
                className="btn btn-secondary btn-sm"
              >
                <Sparkles size={14} className="text-mint" />
                <span className="hidden sm:inline">Ask Nova</span>
              </button>
              <Link
                href="/settings"
                className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-mint/80 to-violet/80 text-[0.68rem] font-bold leading-none text-ink"
                aria-label="Settings"
              >
                {initials(user.name)}
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-14">
          {children}
        </main>
      </div>

      {/* ------------------------------------------------------------- mobile nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/8 bg-ink/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {MOBILE_PRIMARY.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[0.6rem] font-semibold transition",
                  active ? "text-mint" : "text-muted",
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-xl transition",
                    active && "bg-mint/12 shadow-[0_0_18px_rgba(91,240,200,0.25)]",
                  )}
                >
                  <Icon size={17} />
                </span>
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex flex-col items-center gap-1 py-2.5 text-[0.6rem] font-semibold text-muted"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl">
              <Menu size={17} />
            </span>
            More
          </button>
        </div>
      </nav>

      {/* ------------------------------------------------------------- mobile menu */}
      <div
        onClick={() => setMenuOpen(false)}
        className={cn(
          "fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm transition-opacity lg:hidden",
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden="true"
      />
      <div
        className={cn(
          "glass-strong fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-white/10 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 transition-transform duration-300 lg:hidden",
          menuOpen ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Nova size={36} mood="happy" />
            <div>
              <p className="display text-sm font-semibold text-cream">More in StudyMaster</p>
              <p className="text-[0.62rem] text-muted">
                {user.streak} day streak · Level {user.level}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="btn btn-ghost btn-icon"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[NAV[3], NAV[5], NAV[6], NAV[7], NAV[8], NAV[9]].map((item) => {
            if (!item) return null;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-2xl border border-white/8 bg-white/[0.04] px-3.5 py-3 text-sm text-cream"
              >
                <Icon size={16} className="text-mint" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setAssistantOpen(true);
            }}
            className="btn btn-primary flex-1"
          >
            <Sparkles size={15} />
            Ask Nova
          </button>
          <button
            type="button"
            onClick={() => void signOut({ callbackUrl: "/" })}
            className="btn btn-secondary"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </div>

      <AssistantDrawer
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        aiEnabled={aiEnabled}
        studentName={user.name.split(" ")[0] || "friend"}
      />
    </div>
  );
}
