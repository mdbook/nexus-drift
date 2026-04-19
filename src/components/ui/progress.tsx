import { cn } from "@/lib/cn";

type ProgressProps = {
  className?: string;
  value: number;
};

export function Progress({ className, value }: ProgressProps) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("overflow-hidden rounded-full bg-white/10", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-cyan-200 via-white to-fuchsia-200 transition-[width] duration-300"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}

