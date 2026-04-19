import type { ComponentType, CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { Bot, Coins, Cpu, Crosshair, Gem, Hammer, Pickaxe, Radar, Shield, Swords, Zap } from "lucide-react";
import { Background } from "@/components/Background";
import { FieldSvg } from "@/components/FieldSvg";
import { ResourcePill, StatusBadge } from "@/components/HudPrimitives";
import { Sidebar } from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { resourceDefs } from "@/game/data";
import type { ResourceKey, UpgradeKey } from "@/game/types";
import { fmt, clamp } from "@/game/utils";
import { useGameLoop } from "@/hooks/useGameLoop";
import { PANEL_CLASS } from "@/theme";

function useAdminPanel() {
  const [open, setOpen] = useState(false);
  const timestamps = useRef<number[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.target !== document.body) return;
      e.preventDefault();
      const now = Date.now();
      timestamps.current = [...timestamps.current.filter((t) => now - t < 1500), now];
      if (timestamps.current.length >= 5) {
        timestamps.current = [];
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen };
}

const resourceIcons: Record<ResourceKey, ComponentType<{ className?: string; style?: CSSProperties }>> = {
  gold: Coins,
  ore: Pickaxe,
  gems: Gem,
  energy: Zap,
};

const upgradeIcons: Record<UpgradeKey, ComponentType<{ className?: string }>> = {
  miner: Pickaxe,
  drill: Hammer,
  reactor: Cpu,
  bot: Bot,
  turret: Crosshair,
  shield: Shield,
  scout: Radar,
  arsenal: Swords,
};

export default function App() {
  const [speed, setSpeed] = useState(1);
  const { open: adminOpen, setOpen: setAdminOpen } = useAdminPanel();
  const { game, derived } = useGameLoop(speed);
  const xpPct = clamp((game.xp / Math.max(1, derived.targetXp)) * 100, 0, 100);
  const stabilityPct = clamp((derived.defenseScore / Math.max(2, derived.threatScore + 2)) * 100, 0, 100);

  return (
    <div className="relative min-h-screen bg-[#050814] text-white xl:h-screen xl:overflow-hidden">
      <Background />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1600px] flex-col p-3 md:p-4 xl:h-screen">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 text-xs uppercase tracking-[0.35em] text-white/40">Autonomous Colony Sim</div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">NEXUS DRIFT // purge wing online</h1>
            <p className="mt-3 max-w-3xl text-sm text-white/55 md:text-base">
              Autonomous extraction in a contested sector. Miners work the nodes, corruptors rot the grid, raiders push the perimeter. The colony runs itself — your job is to keep it that way.
            </p>
          </div>

          <Card className={`${PANEL_CLASS} min-w-[220px] p-3`}>
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-white/45">
              <span>Sector Level</span>
              <span>{game.level}</span>
            </div>
            <div className="mt-3 text-4xl font-semibold text-white">x{game.combo.toFixed(1)}</div>
            <div className="mt-1 text-sm text-white/55">combo multiplier</div>
            <Progress value={xpPct} className="mt-4 h-2 bg-white/10" />
            <div className="mt-2 flex items-center justify-between text-xs text-white/45">
              <span>XP {fmt(game.xp)}</span>
              <span>{fmt(derived.targetXp)}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <StatusBadge tone={derived.hostilePressure ? "danger" : "calm"}>
                {derived.hostilePressure ? "Perimeter Hot" : "Perimeter Stable"}
              </StatusBadge>
              <StatusBadge tone={derived.corruptionPressure ? "toxic" : "ready"}>
                {derived.corruptionPressure ? "Purge Wing Live" : "Corruption Low"}
              </StatusBadge>
            </div>
          </Card>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
          {resourceDefs.map((resource) => {
            const Icon = resourceIcons[resource.key];
            return (
              <ResourcePill
                key={resource.key}
                label={resource.label}
                value={game.resources[resource.key]}
                rate={derived.rates[resource.key]}
                icon={Icon}
                tint={resource.tint}
                glow={resource.glow}
              />
            );
          })}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:overflow-hidden xl:grid-cols-[1.45fr_0.85fr]">
          <Card className={`${PANEL_CLASS} relative overflow-hidden p-0`}>
            <div className="absolute left-4 top-4 z-20 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs uppercase tracking-[0.24em] text-white/55 backdrop-blur-md">
              active field // perimeter defense + purge wing
            </div>

            <div className="absolute right-4 top-4 z-20 flex gap-2">
              <StatusBadge tone={derived.hostilePressure ? "danger" : "calm"}>Combat {derived.combatThreats}</StatusBadge>
              <StatusBadge tone={derived.corruptionPressure ? "toxic" : "ready"}>Corruption {derived.corruptedNodes}</StatusBadge>
            </div>

            <FieldSvg game={game} derived={derived} />

            <div className="absolute bottom-4 left-4 right-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              {game.agents.map((agent) => (
                <div key={agent.id} className="rounded-3xl border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-md">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">Unit {agent.id}</div>
                  <div className="mt-1 flex items-center justify-between text-sm font-medium text-white">
                    <span>{agent.kind}</span>
                    <span className="text-xs text-white/50">{Math.round(agent.hp)}%</span>
                  </div>
                  <div className="mt-1 text-xs text-white/50">{agent.task}</div>
                </div>
              ))}
            </div>
          </Card>

          <Sidebar game={game} derived={derived} upgradeIcons={upgradeIcons} stabilityPct={stabilityPct} />
        </div>
      </div>
      {adminOpen && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className={`${PANEL_CLASS} flex items-center gap-3 px-4 py-3`}>
            <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">Admin // Speed</span>
            {[1, 2, 5, 10].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                  speed === s
                    ? "bg-white/20 text-white"
                    : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80"
                }`}
              >
                {s}x
              </button>
            ))}
            <button
              onClick={() => setAdminOpen(false)}
              className="ml-1 rounded-xl bg-white/5 px-3 py-1.5 text-xs text-white/40 hover:text-white/70"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
