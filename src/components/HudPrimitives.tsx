import type { ComponentType, CSSProperties, ReactNode } from "react";
import { Card } from "@/components/ui/card";
import type { StatusTone, UpgradeDef } from "@/game/types";
import { fmt } from "@/game/utils";
import { cn } from "@/lib/cn";

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const toneClass =
    tone === "danger"
      ? "border-rose-300/20 bg-rose-300/10 text-rose-100"
      : tone === "toxic"
        ? "border-fuchsia-300/20 bg-fuchsia-300/10 text-fuchsia-100"
        : tone === "ready"
          ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
          : "border-cyan-300/20 bg-cyan-300/10 text-cyan-100";

  return (
    <div className={cn("rounded-2xl border px-3 py-2 text-[11px] uppercase tracking-[0.22em]", toneClass)}>
      {children}
    </div>
  );
}

export function ResourcePill({
  label,
  value,
  rate,
  icon: Icon,
  tint,
  glow,
}: {
  label: string;
  value: number;
  rate: number;
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  tint: string;
  glow: string;
}) {
  return (
    <Card className="flex items-center gap-3 rounded-3xl border-white/10 bg-white/5 px-4 py-3 shadow-lg backdrop-blur-md">
      <div
        className="rounded-2xl p-2.5"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.08)",
          boxShadow: `0 0 24px ${glow}`,
        }}
      >
        <Icon className="h-4 w-4" style={{ color: tint }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.22em] text-white/45">{label}</div>
        <div className="text-lg font-semibold text-white">{fmt(value)}</div>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">rate</div>
        <div className="text-sm font-medium" style={{ color: tint }}>
          +{rate.toFixed(2)}/s
        </div>
      </div>
    </Card>
  );
}

export function StatTile({ label, value, tint }: { label: string; value: string | number; tint?: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">{label}</div>
      <div className="mt-1 text-xl font-semibold" style={{ color: tint ?? "rgba(255,255,255,0.95)" }}>
        {value}
      </div>
    </div>
  );
}

export function UpgradeTile({
  def,
  level,
  cost,
  canAfford,
  icon: Icon,
}: {
  def: UpgradeDef;
  level: number;
  cost: number;
  canAfford: boolean;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border px-3 py-3 transition-colors",
        canAfford ? "border-white/20 bg-white/10" : "border-white/10 bg-white/5"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-2xl bg-white/10 p-2">
          <Icon className="h-4 w-4 text-white/85" />
        </div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">v{level}</div>
      </div>
      <div className="mt-3 text-sm font-medium text-white">{def.label}</div>
      <div className="mt-1 text-[11px] leading-relaxed text-white/45">{def.effectText}</div>
      <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.18em]">
        <span className={canAfford ? "text-emerald-200" : "text-white/35"}>{canAfford ? "Ready" : "Queue"}</span>
        <span className="text-white/55">{fmt(cost)} G</span>
      </div>
    </div>
  );
}
