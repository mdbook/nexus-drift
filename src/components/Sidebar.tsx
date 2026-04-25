import { memo, type ComponentType } from "react";
import { AlertTriangle, Bot, TrendingUp } from "lucide-react";
import { ActivityLog } from "@/components/ActivityLog";
import { StatTile, UpgradeTile } from "@/components/HudPrimitives";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TICK_MS } from "@/game/constants";
import { resourceDefs, upgradeDefs } from "@/game/data";
import type { DerivedState, GameState, UpgradeKey } from "@/game/types";
import { canAffordUpgrade, nextUpgradeCost, fmt, stateSafe } from "@/game/utils";
import { PANEL_CLASS } from "@/theme";

type SidebarProps = {
  game: GameState;
  derived: DerivedState;
  upgradeIcons: Record<UpgradeKey, ComponentType<{ className?: string }>>;
  stabilityPct: number;
};

export const Sidebar = memo(function Sidebar({ game, derived, upgradeIcons, stabilityPct }: SidebarProps) {
  const spawnCadenceSeconds = (derived.progression.spawnIntervalTicks * TICK_MS) / 1000;
  const visibleUpgrades = upgradeDefs.filter((def) => {
    // Always show upgrades the player has already invested in, even if their
    // tier later drops below the gate (or an admin preset jumped them past it).
    const alreadyPurchased = (game.upgrades[def.key] ?? 0) > 0;
    if (!alreadyPurchased && def.minTier !== undefined && derived.progression.tier < def.minTier)
      return false;
    if (def.key === "sentinel" && !alreadyPurchased && game.stats.brutesKilled === 0) return false;
    return true;
  });

  return (
    <div className="flex min-w-0 flex-col gap-3 lg:h-full lg:overflow-y-auto">
      <Card className={`${PANEL_CLASS} shrink-0 p-3`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">Economy</div>
            <div className="mt-1 text-lg font-semibold text-white">Autonomous throughput</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-2">
            <TrendingUp className="h-4 w-4 text-white/80" />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <StatTile
            label="Total Income"
            value={`${fmt(derived.totalIncome)}/s`}
            tint="rgba(130,255,210,0.95)"
          />
          <StatTile
            label="Colony Health"
            value={`${Math.round(derived.colonyHealth)}%`}
            tint={derived.colonyHealth < 72 ? "rgba(255,170,170,0.95)" : "rgba(180,230,255,0.95)"}
          />
          <StatTile label="Prestige" value={`+${game.prestige}`} tint="rgba(255,220,150,0.95)" />
          <StatTile label="Stability" value={`${Math.round(stabilityPct)}%`} tint="rgba(160,235,255,0.95)" />
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-white/40">
            <span>Threat / Defense Balance</span>
            <span>
              {derived.defenseScore.toFixed(1)} : {derived.threatScore.toFixed(1)}
            </span>
          </div>
          <Progress value={stabilityPct} className="mt-2 h-2 bg-white/10" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {resourceDefs.map((resource) => (
            <div key={resource.key} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/38">{resource.label}</div>
              <div className="mt-1 text-sm font-medium" style={{ color: resource.tint }}>
                +{derived.rates[resource.key].toFixed(2)}/s
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className={`${PANEL_CLASS} shrink-0 p-3`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">Automation</div>
            <div className="mt-1 text-lg font-semibold text-white">Colony brain upgrade queue</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-2">
            <Bot className="h-4 w-4 text-white/80" />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatTile label="Active Turrets" value={derived.activeTurrets} tint="rgba(255,255,255,0.95)" />
          <StatTile label="Active Scouts" value={derived.activeScouts} tint="rgba(220,180,255,0.95)" />
          <StatTile label="Sentinels" value={derived.activeSentinels} tint="rgba(251,191,36,0.95)" />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {visibleUpgrades.map((def) => {
            const Icon = upgradeIcons[def.key];
            const cost = nextUpgradeCost(def, game.upgrades[def.key]);
            return (
              <UpgradeTile
                key={def.key}
                def={def}
                level={game.upgrades[def.key]}
                cost={cost}
                canAfford={canAffordUpgrade(game.resources, cost)}
                icon={Icon}
              />
            );
          })}
        </div>
      </Card>

      <Card className={`${PANEL_CLASS} shrink-0 p-3`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">Threat / Activity</div>
            <div className="mt-1 text-lg font-semibold text-white">Perimeter pressure and logs</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-2">
            <AlertTriangle className="h-4 w-4 text-white/80" />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <StatTile label="Combat Contacts" value={derived.combatThreats} tint="rgba(255,170,170,0.95)" />
          <StatTile label="Corrupters" value={derived.corruptorCount} tint="rgba(220,170,255,0.95)" />
          <StatTile label="Corrupted Nodes" value={derived.corruptedNodes} tint="rgba(220,170,255,0.95)" />
          <StatTile
            label="Blocked Damage"
            value={fmt(stateSafe(game.stats.blocked))}
            tint="rgba(170,220,255,0.95)"
          />
          <StatTile label="Hostiles Cleared" value={game.stats.hostileKills} tint="rgba(255,220,180,0.95)" />
          <StatTile label="Purges" value={game.stats.purges} tint="rgba(220,190,255,0.95)" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <StatTile
            label="Threat Tier"
            value={`T${derived.progression.tier} ${derived.progression.label}`}
            tint="rgba(255,235,185,0.95)"
          />
          <StatTile
            label="Spawn Cadence"
            value={`${spawnCadenceSeconds.toFixed(1)}s`}
            tint={derived.progression.recoveryMode ? "rgba(255,205,205,0.95)" : "rgba(180,235,255,0.95)"}
          />
          <StatTile
            label="Wave Budget"
            value={derived.progression.waveBudget.toFixed(1)}
            tint="rgba(255,190,150,0.95)"
          />
          <StatTile label="Enemy Cap" value={derived.progression.enemyCap} tint="rgba(210,220,255,0.95)" />
        </div>

        {derived.progression.recoveryMode && (
          <div className="mt-3 rounded-2xl border border-rose-300/15 bg-rose-300/10 px-3 py-2 text-xs text-rose-100/85">
            Threat director is slowing wave pacing while the colony absorbs pressure.
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/38">Ore Rot</div>
            <div className="mt-1 text-sm font-medium text-white/80">{derived.corruptedByType.ore}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/38">Gem Rot</div>
            <div className="mt-1 text-sm font-medium text-white/80">{derived.corruptedByType.gems}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/38">Energy Rot</div>
            <div className="mt-1 text-sm font-medium text-white/80">{derived.corruptedByType.energy}</div>
          </div>
        </div>

        <ActivityLog log={game.log} currentTick={game.timers.tick} />
      </Card>
    </div>
  );
});
