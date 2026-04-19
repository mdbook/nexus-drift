import type { ComponentType } from "react";
import { AlertTriangle, Bot, TrendingUp } from "lucide-react";
import { StatTile, UpgradeTile } from "@/components/HudPrimitives";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { resourceDefs, upgradeDefs } from "@/game/data";
import type { DerivedState, GameState, UpgradeKey } from "@/game/types";
import { nextUpgradeCost, fmt, stateSafe } from "@/game/utils";
import { PANEL_CLASS } from "@/theme";

type SidebarProps = {
  game: GameState;
  derived: DerivedState;
  upgradeIcons: Record<UpgradeKey, ComponentType<{ className?: string }>>;
  stabilityPct: number;
};

export function Sidebar({ game, derived, upgradeIcons, stabilityPct }: SidebarProps) {
  return (
    <div className="grid min-h-0 grid-rows-[auto_auto_1fr] gap-4">
      <Card className={`${PANEL_CLASS} p-4`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">Economy</div>
            <div className="mt-1 text-lg font-semibold text-white">Autonomous throughput</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-2">
            <TrendingUp className="h-4 w-4 text-white/80" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <StatTile label="Total Income" value={`${fmt(derived.totalIncome)}/s`} tint="rgba(130,255,210,0.95)" />
          <StatTile
            label="Colony Health"
            value={`${Math.round(derived.colonyHealth)}%`}
            tint={derived.colonyHealth < 72 ? "rgba(255,170,170,0.95)" : "rgba(180,230,255,0.95)"}
          />
          <StatTile label="Prestige" value={`+${game.prestige}`} tint="rgba(255,220,150,0.95)" />
          <StatTile label="Stability" value={`${Math.round(stabilityPct)}%`} tint="rgba(160,235,255,0.95)" />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-white/40">
            <span>Threat / Defense Balance</span>
            <span>
              {derived.defenseScore.toFixed(1)} : {derived.threatScore.toFixed(1)}
            </span>
          </div>
          <Progress value={stabilityPct} className="mt-2 h-2 bg-white/10" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
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

      <Card className={`${PANEL_CLASS} p-4`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">Automation</div>
            <div className="mt-1 text-lg font-semibold text-white">Colony brain upgrade queue</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-2">
            <Bot className="h-4 w-4 text-white/80" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <StatTile label="Active Turrets" value={derived.activeTurrets} tint="rgba(255,255,255,0.95)" />
          <StatTile label="Active Scouts" value={derived.activeScouts} tint="rgba(220,180,255,0.95)" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {upgradeDefs.map((def) => {
            const Icon = upgradeIcons[def.key];
            return (
              <UpgradeTile
                key={def.key}
                def={def}
                level={game.upgrades[def.key]}
                cost={nextUpgradeCost(def, game.upgrades[def.key])}
                canAfford={game.resources.gold >= nextUpgradeCost(def, game.upgrades[def.key])}
                icon={Icon}
              />
            );
          })}
        </div>
      </Card>

      <Card className={`${PANEL_CLASS} flex min-h-0 flex-col p-4`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">Threat / Activity</div>
            <div className="mt-1 text-lg font-semibold text-white">Perimeter pressure and logs</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-2">
            <AlertTriangle className="h-4 w-4 text-white/80" />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <StatTile label="Combat Contacts" value={derived.combatThreats} tint="rgba(255,170,170,0.95)" />
          <StatTile label="Corrupters" value={derived.corruptorCount} tint="rgba(220,170,255,0.95)" />
          <StatTile label="Corrupted Nodes" value={derived.corruptedNodes} tint="rgba(220,170,255,0.95)" />
          <StatTile label="Blocked Damage" value={fmt(stateSafe(game.stats.blocked))} tint="rgba(170,220,255,0.95)" />
          <StatTile label="Hostiles Cleared" value={game.stats.hostileKills} tint="rgba(255,220,180,0.95)" />
          <StatTile label="Purges" value={game.stats.purges} tint="rgba(220,190,255,0.95)" />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
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

        <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-3xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">Activity Log</div>
            <div className="rounded-2xl bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-white/45">
              live
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {game.log.map((entry, index) => (
              <div key={`${entry}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/75">
                {entry}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
