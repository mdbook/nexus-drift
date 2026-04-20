import { memo, type ComponentType } from "react";
import { useTooltip } from "@/hooks/useTooltip";
import { TooltipPanel } from "@/components/Tooltip";
import { upgradeDefs } from "@/game/data";
import type { DerivedState, GameState, UpgradeKey } from "@/game/types";
import { canAffordUpgrade, formatUpgradeCost, nextUpgradeCost } from "@/game/utils";
import { cn } from "@/lib/cn";

type Props = {
  game: GameState;
  derived: DerivedState;
  upgradeIcons: Record<UpgradeKey, ComponentType<{ className?: string }>>;
};

type UpgradeCategory = "yield" | "defense" | "support" | "elite";

// Category drives colour. Each upgrade belongs to one group; this lets players
// spot at a glance whether they are thin on defense vs yield at any level.
const UPGRADE_CATEGORY: Record<UpgradeKey, UpgradeCategory> = {
  miner: "yield",
  drill: "yield",
  reactor: "yield",
  foundry: "yield",
  turret: "defense",
  shield: "defense",
  sentinel: "defense",
  scout: "support",
  arsenal: "support",
  bot: "support",
  archive: "elite",
  focusedBeam: "defense",
};

const CATEGORY_STYLE: Record<
  UpgradeCategory,
  { dot: string; ring: string; glow: string; tooltipBorder: string; label: string }
> = {
  yield: {
    dot: "bg-amber-300",
    ring: "ring-amber-300/40",
    glow: "0 0 10px rgba(253,230,138,0.55)",
    tooltipBorder: "border-amber-300/40",
    label: "text-amber-200",
  },
  defense: {
    dot: "bg-cyan-300",
    ring: "ring-cyan-300/40",
    glow: "0 0 10px rgba(103,232,249,0.55)",
    tooltipBorder: "border-cyan-300/40",
    label: "text-cyan-200",
  },
  support: {
    dot: "bg-fuchsia-300",
    ring: "ring-fuchsia-300/40",
    glow: "0 0 10px rgba(240,171,252,0.55)",
    tooltipBorder: "border-fuchsia-300/40",
    label: "text-fuchsia-200",
  },
  elite: {
    dot: "bg-indigo-300",
    ring: "ring-indigo-300/40",
    glow: "0 0 10px rgba(165,180,252,0.55)",
    tooltipBorder: "border-indigo-300/40",
    label: "text-indigo-200",
  },
};

const CATEGORY_LABEL: Record<UpgradeCategory, string> = {
  yield: "Yield",
  defense: "Defense",
  support: "Support",
  elite: "Elite",
};

type DotProps = {
  def: (typeof upgradeDefs)[number];
  level: number;
  category: UpgradeCategory;
  canAfford: boolean;
  costLine: string;
  Icon: ComponentType<{ className?: string }>;
};

function UpgradeDot({ def, level, category, canAfford, costLine, Icon }: DotProps) {
  const style = CATEGORY_STYLE[category];
  const owned = level > 0;
  const intensity = Math.min(1, level / 5);
  const tooltipId = `upgrade-dot-${def.key}`;
  const { open, triggerRef, triggerProps, anchor } = useTooltip(tooltipId, 240);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${def.label} level ${level}`}
        {...triggerProps}
        className={cn(
          "group relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 md:h-8 md:w-8",
          owned
            ? canAfford
              ? "border-white/25 bg-white/[0.08] hover:bg-white/[0.14]"
              : "border-white/15 bg-white/5 hover:bg-white/10"
            : canAfford
              ? "border-white/20 bg-white/5 hover:bg-white/10"
              : "border-white/10 bg-black/20 hover:bg-white/[0.06]"
        )}
      >
        <Icon className={cn("h-3.5 w-3.5 md:h-4 md:w-4", owned ? "text-white/85" : "text-white/40")} />
        {/* glowing level indicator — the corner dot — scales with level intensity */}
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full transition-all md:h-2.5 md:w-2.5",
            owned ? style.dot : "bg-white/20"
          )}
          style={{
            boxShadow: owned ? style.glow : undefined,
            transform: owned ? `scale(${0.85 + intensity * 0.4})` : "scale(0.8)",
            opacity: owned ? 0.7 + intensity * 0.3 : 0.4,
          }}
        />
        {/* affordability ping — a subtle outer ring when the next level is buyable */}
        {canAfford && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 animate-pulse rounded-full ring-2",
              style.ring
            )}
          />
        )}
      </button>

      <TooltipPanel id={tooltipId} open={open} anchor={anchor} width={240} borderClass={style.tooltipBorder}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">
              {CATEGORY_LABEL[category]}
            </div>
            <div className="mt-0.5 text-sm font-semibold text-white">{def.label}</div>
          </div>
          <div
            className={cn(
              "shrink-0 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em]",
              owned ? "text-white/80" : "text-white/40"
            )}
          >
            Lv {level}
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-white/65">{def.effectText}</p>
        <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2 text-[11px] uppercase tracking-[0.18em]">
          <span className={canAfford ? "text-emerald-300" : "text-white/35"}>
            {canAfford ? "Buy Ready" : "Saving"}
          </span>
          <span className="text-white/55 normal-case tracking-normal">{costLine}</span>
        </div>
      </TooltipPanel>
    </>
  );
}

/**
 * Compact horizontal rail of one glowing dot per currently-unlocked upgrade.
 * Intended as a glanceable alternative to sidebar-only upgrade visibility —
 * especially important on mobile where the sidebar sits below the field.
 */
export const UpgradeIndicatorRail = memo(function UpgradeIndicatorRail({ game, derived, upgradeIcons }: Props) {
  const visible = upgradeDefs.filter((def) => {
    // Match Sidebar visibility rules exactly so the rail stays in sync.
    if (def.minTier !== undefined && derived.progression.tier < def.minTier) return false;
    if (def.key === "sentinel" && game.stats.brutesKilled === 0) return false;
    return true;
  });

  if (!visible.length) return null;

  return (
    // Outer div: positioning context for tooltips only — must NOT have overflow
    // or be a flex container itself (either breaks tooltip escape upward).
    <div className="relative shrink-0" role="group" aria-label="Upgrade status">
      {/* overflow-x-auto is on this inner row, NOT the outer div, for the same
          reason as FieldStatsStrip: the outer div is the tooltip positioning
          context and must not have overflow set. shrink-0 on the outer div
          ensures the card's flex column never collapses this rail. */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-1.5 md:gap-2 md:px-4">
        <span className="shrink-0 text-[9px] uppercase tracking-[0.26em] text-white/35 md:text-[10px]">
          Upgrades
        </span>
        <div className="flex items-center gap-1.5 md:gap-2">
          {visible.map((def) => {
            const level = game.upgrades[def.key];
            const cost = nextUpgradeCost(def, level);
            const affordable = canAffordUpgrade(game.resources, cost);
            const costLine = formatUpgradeCost(cost);
            const category = UPGRADE_CATEGORY[def.key];
            const Icon = upgradeIcons[def.key];
            return (
              <UpgradeDot
                key={def.key}
                def={def}
                level={level}
                category={category}
                canAfford={affordable}
                costLine={costLine}
                Icon={Icon}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});
