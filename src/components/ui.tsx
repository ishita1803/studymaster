import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Nova } from "@/components/nova";

export function Card({
  children,
  className,
  hover = false,
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "glass card",
        hover && "card-hover",
        glow && "neon-edge",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="max-w-2xl">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <h2 className="display text-2xl font-semibold text-cream sm:text-3xl">{title}</h2>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  mascot = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  mascot?: boolean;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-6">
      <div className="flex items-start gap-4">
        {mascot ? (
          <div className="hidden sm:block">
            <NovaMascotSmall />
          </div>
        ) : null}
        <div>
          {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
          <h1 className="display text-3xl font-semibold text-cream sm:text-4xl">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

function NovaMascotSmall() {
  return <Nova size={56} mood="happy" />;
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "mint",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
  tone?: "mint" | "violet" | "pink" | "amber" | "sky";
  className?: string;
}) {
  const toneStyles: Record<string, string> = {
    mint: "text-mint bg-mint/10 border-mint/25",
    violet: "text-violet bg-violet/10 border-violet/25",
    pink: "text-pink bg-pink/10 border-pink/25",
    amber: "text-amber bg-amber/10 border-amber/25",
    sky: "text-sky bg-sky/10 border-sky/25",
  };

  return (
    <Card className={cn("p-5", className)} hover>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted">
            {label}
          </p>
          <p className="display mt-2 text-2xl font-semibold text-cream sm:text-3xl">{value}</p>
          {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
        </div>
        {Icon ? (
          <span
            className={cn(
              "grid h-10 w-10 place-items-center rounded-2xl border",
              toneStyles[tone],
            )}
          >
            <Icon size={18} />
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export function ProgressBar({
  value,
  className,
  showLabel = false,
}: {
  value: number;
  className?: string;
  showLabel?: boolean;
}) {
  const safe = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="progress-track flex-1">
        <div className="progress-fill" style={{ width: `${safe}%` }} />
      </div>
      {showLabel ? (
        <span className="w-9 text-right text-xs font-semibold text-muted">{safe}%</span>
      ) : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-mint/25 bg-mint/10 text-mint">
          <Icon size={22} />
        </span>
      ) : null}
      <p className="display text-lg font-semibold text-cream">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      ) : null}
      {action ? (
        <Link href={action.href} className="btn btn-secondary btn-sm mt-5">
          {action.label}
          <ArrowRight size={14} />
        </Link>
      ) : null}
    </div>
  );
}

export function ReadinessRing({
  value,
  size = 150,
  label = "Exam readiness",
  sublabel,
}: {
  value: number;
  size?: number;
  label?: string;
  sublabel?: string;
}) {
  const safe = Math.min(100, Math.max(0, Math.round(value)));
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - safe / 100);

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="readiness-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5BF0C8" />
            <stop offset="55%" stopColor="#8FF0D9" />
            <stop offset="100%" stopColor="#A78BFA" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={9}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#readiness-gradient)"
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ filter: "drop-shadow(0 0 7px rgba(91,240,200,0.5))" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="display text-3xl font-semibold text-cream">{safe}%</p>
          <p className="mt-0.5 text-[0.65rem] uppercase tracking-[0.14em] text-muted">{label}</p>
          {sublabel ? <p className="mt-1 text-[0.68rem] text-mint">{sublabel}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function WeeklyBars({
  data,
  className,
}: {
  data: { label: string; minutes: number }[];
  className?: string;
}) {
  const max = Math.max(30, ...data.map((item) => item.minutes));
  return (
    <div className={cn("flex h-32 items-end gap-2", className)}>
      {data.map((item) => {
        const height = Math.max(6, Math.round((item.minutes / max) * 100));
        return (
          <div key={item.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <div className="relative flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-lg bg-gradient-to-t from-violet/60 via-mint/70 to-mint transition-all"
                style={{ height: `${height}%`, boxShadow: "0 0 18px rgba(91,240,200,0.18)" }}
                title={`${item.minutes} min`}
              />
            </div>
            <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ScoreLine({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  if (values.length === 0) {
    return (
      <div className={cn("grid h-32 place-items-center text-xs text-muted", className)}>
        Take a quiz to start your score trend.
      </div>
    );
  }

  const width = 320;
  const height = 110;
  const pad = 8;
  const points = values.map((value, index) => {
    const x =
      values.length === 1
        ? width / 2
        : pad + (index / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - (Math.min(100, Math.max(0, value)) / 100) * (height - pad * 2);
    return { x, y, value };
  });

  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-32 w-full", className)}
      role="img"
      aria-label="Quiz score trend"
    >
      <defs>
        <linearGradient id="score-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5BF0C8" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#5BF0C8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="score-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5BF0C8" />
          <stop offset="100%" stopColor="#A78BFA" />
        </linearGradient>
      </defs>
      {[25, 50, 75].map((tick) => (
        <line
          key={tick}
          x1={pad}
          x2={width - pad}
          y1={height - pad - (tick / 100) * (height - pad * 2)}
          y2={height - pad - (tick / 100) * (height - pad * 2)}
          stroke="rgba(255,255,255,0.06)"
          strokeDasharray="3 5"
        />
      ))}
      <polygon points={area} fill="url(#score-area)" />
      <polyline
        points={line}
        fill="none"
        stroke="url(#score-line)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={3}
          fill="#0B0F1A"
          stroke="#5BF0C8"
          strokeWidth={2}
        />
      ))}
    </svg>
  );
}

export function IconOrb({
  icon: Icon,
  tone = "mint",
  size = "md",
}: {
  icon: LucideIcon;
  tone?: "mint" | "violet" | "pink" | "amber" | "sky";
  size?: "sm" | "md" | "lg";
}) {
  const tones: Record<string, string> = {
    mint: "border-mint/25 bg-mint/10 text-mint",
    violet: "border-violet/25 bg-violet/10 text-violet",
    pink: "border-pink/25 bg-pink/10 text-pink",
    amber: "border-amber/25 bg-amber/10 text-amber",
    sky: "border-sky/25 bg-sky/10 text-sky",
  };
  const sizes = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" };
  const icons = { sm: 15, md: 18, lg: 22 };

  return (
    <span className={cn("grid place-items-center rounded-2xl border", tones[tone], sizes[size])}>
      <Icon size={icons[size]} />
    </span>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-cream">{value}</span>
    </div>
  );
}
