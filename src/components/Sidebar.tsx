import { memo, type ComponentType } from "react";
import { AlertTriangle, Bot, TrendingUp } from "lucide-react";
import { ActivityLog } from "@/components/ActivityLog";
import { StatTile, UpgradeTile } from "@/components/HudPrimitives";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { idleModeButtonClass, idleModeDotClass, isIdleModeActive } from "@/components/idleModeButton";
import { TICK_MS } from "@/game/constants";
import { resourceDefs, upgradeDefs } from "@/game/data";
import { purchaseFailReason } from "@/game/purchases";
import type { DerivedState, GameState, UpgradeKey } from "@/game/types";
import { nextUpgradeCost, fmt, stateSafe } from "@/game/utils";
import { PANEL_CLASS } from "@/theme";

type AutoMaster = GameState["upgradeAutoMaster"];

const MASTER_OPTIONS: { value: AutoMaster; label: string }[] = [
  { value: "all", label: "All" },
  { value: "none", label: "None" },
  { value: "custom", label: "Custom" },
];

type SidebarProps = {
  game: GameState;
  derived: DerivedState;
  upgradeIcons: Record<UpgradeKey, ComponentType<{ className?: string }>>;
  stabilityPct: number;
  onPurchase: (key: UpgradeKey) => void;
  onToggleAuto: (key: UpgradeKey) => void;
  onSetAutoMaster: (master: AutoMaster) => void;
};

export const Sidebar = memo(function Sidebar({
  game,
  derived,
  upgradeIcons,
  stabilityPct,
  onPurchase,
  onToggleAuto,
  onSetAutoMaster,
}: SidebarProps) {
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

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-[0.22em] text-white/40">Autobuy</span>
          <div className="flex items-center gap-2.5">
            {/* 4.0 — Idle Mode quick-toggle: one tap flips master to All (the old
                hands-off idle sim); tapping again while on returns to manual.
                4.1.0 — when active it reads as a LIT status indicator (glowing
                emerald + status pip), not just a button. Still toggles. */}
            {(() => {
              const idleActive = isIdleModeActive(game.upgradeAutoMaster);
              return (
                <button
                  type="button"
                  onClick={() => onSetAutoMaster(idleActive ? "none" : "all")}
                  aria-pressed={idleActive}
                  title="Idle Mode: autobuy everything (the classic hands-off sim)"
                  className={idleModeButtonClass(idleActive)}
                >
                  <span className={idleModeDotClass(idleActive)} aria-hidden="true" />
                  Idle Mode
                </button>
              );
            })()}
            <div
              role="group"
              aria-label="Autobuy master switch"
              className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-0.5"
            >
              {MASTER_OPTIONS.map((option) => {
                const active = game.upgradeAutoMaster === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onSetAutoMaster(option.value)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex min-h-[36px] items-center justify-center rounded-full px-3 text-[10px] font-medium uppercase tracking-[0.18em] transition-colors",
                      active ? "bg-emerald-300/15 text-emerald-100" : "text-white/45 hover:text-white/75"
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
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
                reason={purchaseFailReason(game, def.key, { derived })}
                autoOn={game.upgradeAutoFlags[def.key] ?? false}
                onBuy={() => onPurchase(def.key)}
                onToggleAuto={() => onToggleAuto(def.key)}
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

        <ActivityLog log={game.log} archiveLog={game.archiveLog} currentTick={game.timers.tick} />
      </Card>
    </div>
  );
});
