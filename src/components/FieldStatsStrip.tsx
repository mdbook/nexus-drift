import { memo } from "react";
import { useTooltip } from "@/hooks/useTooltip";
import { TooltipPanel } from "@/components/Tooltip";
import { Activity, Crosshair, HeartPulse, Radar, Shield, Swords, Target, Users } from "lucide-react";
import type { DerivedState, GameState } from "@/game/types";
import { cn } from "@/lib/cn";

type Props = {
  game: GameState;
  derived: DerivedState;
};

type IndicatorTone = "calm" | "warn" | "danger" | "ready" | "toxic";

type IndicatorProps = {
  label: string;
  value: string | number;
  tone: IndicatorTone;
  icon: typeof Shield;
  detail: string;
  pulse?: boolean;
};

const TONE: Record<IndicatorTone, { text: string; dot: string; glow: string; border: string }> = {
  calm: {
    text: "text-cyan-100",
    dot: "bg-cyan-300",
    glow: "0 0 6px rgba(103,232,249,0.55)",
    border: "border-cyan-300/30",
  },
  warn: {
    text: "text-amber-100",
    dot: "bg-amber-300",
    glow: "0 0 6px rgba(253,230,138,0.55)",
    border: "border-amber-300/30",
  },
  danger: {
    text: "text-rose-100",
    dot: "bg-rose-400",
    glow: "0 0 6px rgba(244,114,182,0.55)",
    border: "border-rose-400/30",
  },
  ready: {
    text: "text-emerald-100",
    dot: "bg-emerald-300",
    glow: "0 0 6px rgba(110,231,183,0.55)",
    border: "border-emerald-300/30",
  },
  toxic: {
    text: "text-fuchsia-100",
    dot: "bg-fuchsia-300",
    glow: "0 0 6px rgba(240,171,252,0.55)",
    border: "border-fuchsia-300/30",
  },
};

function Indicator({ label, value, tone, icon: Icon, detail, pulse = false }: IndicatorProps) {
  const style = TONE[tone];
  const tooltipId = `field-stat-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const { open, triggerRef, triggerProps, anchor } = useTooltip(tooltipId, 224);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${value}`}
        className="group flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 md:px-3"
        {...triggerProps}
      >
        <Icon className={cn("h-3 w-3 md:h-3.5 md:w-3.5", style.text)} />
        <span className="hidden text-[10px] uppercase tracking-[0.2em] text-white/45 md:inline">{label}</span>
        <span className={cn("font-semibold tabular-nums", style.text)}>{value}</span>
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 rounded-full", style.dot, pulse && "animate-pulse")}
          style={{ boxShadow: style.glow }}
        />
      </button>
      <TooltipPanel id={tooltipId} open={open} anchor={anchor} width={224} borderClass={style.border}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/45">{label}</span>
          <span className={cn("text-sm font-semibold tabular-nums", style.text)}>{value}</span>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-white/65">{detail}</p>
      </TooltipPanel>
    </>
  );
}

function averageHealth(game: GameState) {
  const active = game.agents.filter((a) => a.active);
  if (!active.length) return 100;
  const total = active.reduce((sum, agent) => sum + (agent.maxHp > 0 ? agent.hp / agent.maxHp : 0), 0);
  return Math.round((total / active.length) * 100);
}

/**
 * Compact stats strip that lives inside the field card, replacing the previous
 * verbose crew line. Each pill shows a single glanceable value with a hover
 * tooltip that expands it into a sentence. On mobile the label hides and only
 * the icon + value remain to save horizontal space.
 */
export const FieldStatsStrip = memo(function FieldStatsStrip({ game, derived }: Props) {
  const activeCrews = game.agents.filter((a) => a.active).length;
  const integrity = averageHealth(game);
  const integrityTone: IndicatorTone = integrity < 45 ? "danger" : integrity < 72 ? "warn" : "ready";

  const combatTone: IndicatorTone =
    derived.combatThreats === 0 ? "calm" : derived.hostilePressure ? "danger" : "warn";

  const corruptionTone: IndicatorTone = derived.corruptionPressure ? "toxic" : "ready";

  const comboTone: IndicatorTone = game.combo >= 2 ? "ready" : "calm";

  const tierTone: IndicatorTone = derived.progression.recoveryMode
    ? "warn"
    : derived.progression.tier >= 5
      ? "danger"
      : "calm";

  return (
    // Outer div: positioning context for tooltips only — must NOT have overflow
    // so bottom-full tooltips escape upward unclipped. Not a flex container
    // itself; the inner row owns all flex/scroll layout.
    <div className="relative shrink-0" role="group" aria-label="Field status">
      {/* overflow-x-auto is on this inner row, NOT the outer div. If overflow-x
          is set on the same element used as a tooltip positioning context, the
          CSS overflow interaction rule clips overflow-y and swallows upward
          absolute tooltips. The outer div carries shrink-0 so the card's flex
          column never squeezes this strip against the SVG flex-1 above it. */}
      <div className="flex items-center gap-1 overflow-x-auto px-3 pb-2 pt-1.5 md:gap-1.5 md:px-4">
        <Indicator
          label="Crews"
          value={activeCrews}
          tone="calm"
          icon={Users}
          detail={`${activeCrews} autonomous workers deployed across the sector.`}
        />
        <Indicator
          label="Integrity"
          value={`${integrity}%`}
          tone={integrityTone}
          icon={HeartPulse}
          detail={
            integrity < 45
              ? "Crew integrity critical — workers need to reach home pads to recover."
              : integrity < 72
                ? "Crew sustaining pressure — recovery possible if threats clear."
                : "Crew operating at full capacity."
          }
          pulse={integrity < 45}
        />
        <Indicator
          label="Turrets"
          value={derived.activeTurrets}
          tone="calm"
          icon={Crosshair}
          detail={
            derived.activeTurrets > 0
              ? `${derived.activeTurrets} static turrets online. Upgrade Defense Turret to unlock more.`
              : "No perimeter turrets deployed — Defense Turret unlocks at threat tier 3 (Raid)."
          }
        />
        <Indicator
          label="Silos"
          value={derived.activeMissileSilos}
          tone="warn"
          icon={Target}
          detail={`${derived.activeMissileSilos} missile silo${derived.activeMissileSilos === 1 ? "" : "s"} armed. Long-range stand-off strikes; upgrade Missile Launcher for more silos and range.`}
        />

        {derived.activeScouts > 0 && (
          <Indicator
            label="Scouts"
            value={derived.activeScouts}
            tone="toxic"
            icon={Radar}
            detail={`${derived.activeScouts} assault scout${derived.activeScouts === 1 ? "" : "s"} hunting corruption across the field.`}
          />
        )}
        {derived.activeSentinels > 0 && (
          <Indicator
            label="Sentinels"
            value={derived.activeSentinels}
            tone="warn"
            icon={Shield}
            detail={`${derived.activeSentinels} heavy mech${derived.activeSentinels === 1 ? "" : "s"} patrolling midfield against elite targets.`}
          />
        )}
        <Indicator
          label="Combat"
          value={derived.combatThreats}
          tone={combatTone}
          icon={Swords}
          detail={
            derived.combatThreats === 0
              ? "Perimeter clear. No combat targets on the field."
              : `${derived.combatThreats} hostile${derived.combatThreats === 1 ? "" : "s"} engaging the perimeter.`
          }
          pulse={derived.hostilePressure}
        />
        <Indicator
          label="Corruption"
          value={derived.corruptorCount + derived.activeCorruptionNodes}
          tone={corruptionTone}
          icon={Activity}
          detail={
            derived.corruptionPressure
              ? `${derived.corruptorCount} corruptor${derived.corruptorCount === 1 ? "" : "s"} active across ${derived.activeCorruptionNodes} infected node${derived.activeCorruptionNodes === 1 ? "" : "s"}.`
              : "No active corruption pressure. Purge wing idle."
          }
          pulse={derived.corruptionPressure}
        />
        <Indicator
          label="Tier"
          value={`T${derived.progression.tier}`}
          tone={tierTone}
          icon={Swords}
          detail={
            derived.progression.recoveryMode
              ? `Threat director in recovery — slowing waves while the colony absorbs pressure (${derived.progression.label}).`
              : `Threat director running at ${derived.progression.label}.`
          }
        />
        <Indicator
          label="Combo"
          value={`x${game.combo.toFixed(1)}`}
          tone={comboTone}
          icon={Activity}
          detail="Sector combo multiplier. Climbs with kills, clears, and steady play. Feeds prestige bonuses."
        />
      </div>
    </div>
  );
});
