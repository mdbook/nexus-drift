import type { ComponentType, CSSProperties, ReactNode } from "react";
import { Card } from "@/components/ui/card";
import type { PurchaseFailReason } from "@/game/purchases";
import type { ResourceKey, StatusTone, UpgradeDef } from "@/game/types";
import { fmt, formatUpgradeCost } from "@/game/utils";
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
          {rate >= 0 ? "+" : ""}
          {rate.toFixed(2)}/s
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

/**
 * Buy-button copy + tone for each unpurchasable reason. Tones stay inside the
 * existing HUD vocabulary (§Indicator Conventions): emerald `ready` for a live
 * buy, amber `warn` for a tier gate, cyan `calm` for a hard cap, and the muted
 * white "queue" wash for the ordinary "save up" state.
 */
function buyState(reason: PurchaseFailReason | undefined, minTier?: number) {
  switch (reason) {
    case undefined:
      return { label: "Buy", title: "Purchase next level", tone: "text-emerald-100" };
    case "locked":
      return {
        label: "Locked",
        title: minTier !== undefined ? `Requires threat tier ${minTier}` : "Locked",
        tone: "text-amber-100/80",
      };
    case "maxed":
      return { label: "Maxed", title: "Fully upgraded", tone: "text-cyan-100/70" };
    case "insufficient":
      return { label: "Queue", title: "Not enough resources yet", tone: "text-white/35" };
  }
}

export function UpgradeTile({
  def,
  level,
  cost,
  reason,
  autoOn,
  onBuy,
  onToggleAuto,
  icon: Icon,
}: {
  def: UpgradeDef;
  level: number;
  cost: Partial<Record<ResourceKey, number>>;
  /** Why this tile can't be bought right now; `undefined` means purchasable. */
  reason: PurchaseFailReason | undefined;
  /** Current per-upgrade autobuy opt-in (`upgradeAutoFlags[key] ?? false`). */
  autoOn: boolean;
  onBuy: () => void;
  onToggleAuto: () => void;
  icon: ComponentType<{ className?: string }>;
}) {
  const purchasable = reason === undefined;
  const buy = buyState(reason, def.minTier);

  return (
    <div
      className={cn(
        "rounded-3xl border px-3 py-3 transition-colors",
        purchasable ? "border-emerald-300/25 bg-emerald-300/[0.06]" : "border-white/10 bg-white/5"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-2xl bg-white/10 p-2">
          <Icon className="h-4 w-4 text-white/85" />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleAuto}
            aria-pressed={autoOn}
            aria-label={`Toggle autobuy for ${def.label}`}
            title={autoOn ? "Autobuy on (when master is Custom)" : "Autobuy off"}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.18em] transition-colors",
              autoOn
                ? "border-emerald-300/30 bg-emerald-300/15 text-emerald-100"
                : "border-white/10 bg-white/5 text-white/40 hover:text-white/70"
            )}
          >
            Auto
          </button>
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">v{level}</div>
        </div>
      </div>
      <div className="mt-3 text-sm font-medium text-white">{def.label}</div>
      <div className="mt-1 text-[11px] leading-relaxed text-white/45">{def.effectText}</div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.18em]">
        <button
          type="button"
          onClick={onBuy}
          disabled={!purchasable}
          title={buy.title}
          aria-label={
            purchasable ? `Buy ${def.label} for ${formatUpgradeCost(cost)}` : `${def.label}: ${buy.title}`
          }
          className={cn(
            "rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors",
            purchasable
              ? "border-emerald-300/30 bg-emerald-300/15 text-emerald-100 hover:bg-emerald-300/25"
              : cn("cursor-not-allowed border-white/10 bg-white/5", buy.tone)
          )}
        >
          {buy.label}
        </button>
        <span className="text-right text-white/55">{formatUpgradeCost(cost)}</span>
      </div>
    </div>
  );
}
