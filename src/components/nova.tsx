import { cn } from "@/lib/utils";

type Mood = "happy" | "focused" | "sleepy" | "excited";

export function Nova({
  size = 64,
  mood = "happy",
  float = true,
  className,
}: {
  size?: number;
  mood?: Mood;
  float?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("nova shrink-0", float && "nova-float", `nova-${mood}`, className)}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      <div className="nova-body">
        <span className="nova-eye left" />
        <span className="nova-eye right" />
        <span className="nova-blush left" />
        <span className="nova-blush right" />
        <span className="nova-mouth" />
      </div>
      <span className="nova-sparkle">✦</span>
      <span className="nova-sparkle two">✦</span>
    </div>
  );
}
