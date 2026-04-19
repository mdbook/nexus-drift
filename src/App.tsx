import type { ComponentType, CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Coins,
  Cpu,
  Crosshair,
  Diamond,
  Gem,
  Hammer,
  Hexagon,
  Pickaxe,
  Radar,
  Shield,
  Swords,
  Zap,
} from "lucide-react";
import { Background } from "@/components/Background";
import { FieldSvg } from "@/components/FieldSvg";
import { ResourcePill, StatusBadge } from "@/components/HudPrimitives";
import { Sidebar } from "@/components/Sidebar";
import { Card } from "@/components/ui/card";
import { CHANGELOG, CURRENT_VERSION } from "@/changelog";
import { Progress } from "@/components/ui/progress";
import { resourceDefs } from "@/game/data";
import { activateEvent, EVENT_DEFS } from "@/game/events/eventDefs";
import type { UpgradeKey, VisibleResourceKey } from "@/game/types";
import { clamp, fmt } from "@/game/utils";
import { useGameLoop } from "@/hooks/useGameLoop";
import { PANEL_CLASS } from "@/theme";

function useAdminPanel() {
  const [open, setOpen] = useState(false);
  const timestamps = useRef<number[]>([]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.target !== document.body) return;
      event.preventDefault();
      const now = Date.now();
      timestamps.current = [...timestamps.current.filter((timestamp) => now - timestamp < 1500), now];
      if (timestamps.current.length >= 5) {
        timestamps.current = [];
        setOpen((value) => !value);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen };
}

const resourceIcons: Record<
  VisibleResourceKey,
  ComponentType<{ className?: string; style?: CSSProperties }>
> = {
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
  foundry: Cpu,
  sentinel: Crosshair,
  archive: Bot,
};

export default function App() {
  const [speed, setSpeed] = useState(1);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const { open: adminOpen, setOpen: setAdminOpen } = useAdminPanel();
  const { game, derived, mutateGame } = useGameLoop(speed);
  const xpPct = clamp((game.xp / Math.max(1, derived.targetXp)) * 100, 0, 100);
  const stabilityPct = clamp((derived.defenseScore / Math.max(2, derived.threatScore + 2)) * 100, 0, 100);
  const averageUnitHealth =
    game.agents.length > 0
      ? Math.round(game.agents.reduce((sum, agent) => sum + agent.hp, 0) / game.agents.length)
      : 100;

  useEffect(() => {
    if (!changelogOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") setChangelogOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changelogOpen]);

  return (
    <div className="relative min-h-screen bg-[#050814] text-white xl:h-screen xl:overflow-hidden">
      <Background />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1600px] flex-col p-3 md:p-4 xl:h-screen">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.35em] text-white/40">
              <span>Autonomous Colony Sim</span>
              <button
                type="button"
                onClick={() => setChangelogOpen(true)}
                className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-medium tracking-[0.28em] text-cyan-100/85 transition hover:border-cyan-200/45 hover:bg-cyan-200/15 hover:text-cyan-50"
                aria-expanded={changelogOpen}
                aria-haspopup="dialog"
                aria-label={`Open changelog for version ${CURRENT_VERSION}`}
              >
                v{CURRENT_VERSION}
              </button>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
              NEXUS DRIFT // purge wing online
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-white/55 md:text-base">
              Autonomous extraction in a contested sector. Miners work the nodes, corruptors rot the
              grid, raiders push the perimeter. The colony runs itself - your job is to keep it that
              way.
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

        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {resourceDefs.map((resource) => {
            const Icon = resourceIcons[resource.key];
            return (
              <ResourcePill
                key={resource.key}
                label={resource.label}
                value={derived.resources[resource.key]}
                rate={derived.rates[resource.key]}
                icon={Icon}
                tint={resource.tint}
                glow={resource.glow}
              />
            );
          })}
          {game.upgrades.scout >= 1 && (
            <ResourcePill
              label="Flux"
              value={derived.resources.flux}
              rate={derived.fluxRate}
              icon={Hexagon}
              tint="rgba(216, 180, 255, 0.95)"
              glow="rgba(168, 85, 247, 0.24)"
            />
          )}
          {derived.progression.tier >= 4 && (
            <ResourcePill
              label="Cores"
              value={derived.resources.cores}
              rate={0}
              icon={Diamond}
              tint="rgba(251, 191, 36, 0.95)"
              glow="rgba(245, 158, 11, 0.24)"
            />
          )}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:overflow-hidden xl:grid-cols-[1.45fr_0.85fr]">
          <Card className={`${PANEL_CLASS} flex flex-col overflow-hidden p-0`}>
            <div className="flex shrink-0 items-center justify-center gap-2 px-4 pb-2 pt-4 md:justify-start">
              <div className="relative flex shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30 p-2 backdrop-blur-md md:hidden">
                <Shield className="h-4 w-4 text-white/55" />
                <Zap
                  className="absolute h-2 w-2 translate-y-px text-white/90"
                  fill="currentColor"
                  strokeWidth={0}
                />
              </div>
              <div className="hidden flex-1 items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs uppercase tracking-[0.24em] text-white/55 backdrop-blur-md md:flex">
                <span>active field // perimeter defense + purge wing</span>
                <div className="relative ml-3 shrink-0">
                  <Shield className="h-4 w-4 text-white/55" />
                  <Zap
                    className="absolute inset-0 m-auto h-2 w-2 translate-y-px text-white/90"
                    fill="currentColor"
                    strokeWidth={0}
                  />
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <StatusBadge tone={derived.hostilePressure ? "danger" : "calm"}>
                  Combat {derived.combatThreats}
                </StatusBadge>
                <StatusBadge tone={derived.corruptionPressure ? "toxic" : "ready"}>
                  Corruption {derived.activeCorruptionNodes}
                </StatusBadge>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <FieldSvg game={game} derived={derived} />
            </div>

            {derived.activeEvents.length > 0 && (
              <div className="flex shrink-0 flex-wrap gap-2 px-4 py-2">
                {derived.activeEvents.map((event) => (
                  <span
                    key={event.id}
                    className="rounded-full border border-yellow-700/40 bg-yellow-900/60 px-2 py-0.5 text-xs text-yellow-200"
                  >
                    {event.label} ({Math.ceil(event.ticksRemaining / 30)}s)
                  </span>
                ))}
              </div>
            )}

            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-4 pt-2 text-[10px] uppercase tracking-[0.22em] text-white/38">
              <span>Crews {game.agents.length}</span>
              <span>Avg Integrity {averageUnitHealth}%</span>
              {game.agents.map((agent) => (
                <span key={agent.id}>
                  {agent.kind} // {agent.task}
                </span>
              ))}
            </div>
          </Card>

          <Sidebar
            game={game}
            derived={derived}
            upgradeIcons={upgradeIcons}
            stabilityPct={stabilityPct}
          />
        </div>
      </div>

      {adminOpen && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className={`${PANEL_CLASS} flex flex-col gap-3 px-4 py-3`}>
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                Admin // Speed
              </span>
              {[1, 2, 5, 10].map((value) => (
                <button
                  key={value}
                  onClick={() => setSpeed(value)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                    speed === value
                      ? "bg-white/20 text-white"
                      : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80"
                  }`}
                >
                  {value}x
                </button>
              ))}
              <button
                onClick={() => setAdminOpen(false)}
                className="ml-1 rounded-xl bg-white/5 px-3 py-1.5 text-xs text-white/40 hover:text-white/70"
              >
                x
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                Trigger Event
              </span>
              {EVENT_DEFS.map((eventDef) => (
                <button
                  key={eventDef.id}
                  className="rounded-xl bg-white/5 px-3 py-1.5 text-xs text-white/65 transition hover:bg-white/10 hover:text-white"
                  onClick={() =>
                    mutateGame((next) => {
                      activateEvent(next, eventDef);
                    })
                  }
                >
                  {eventDef.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {changelogOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#02050f]/75 px-3 py-6 backdrop-blur-sm md:px-6"
          onClick={() => setChangelogOpen(false)}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-label="Project changelog"
            className={`${PANEL_CLASS} max-h-[min(720px,92vh)] w-full max-w-3xl overflow-hidden border-cyan-300/15 bg-slate-950/90`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 md:px-6">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-100/55">
                  Release History
                </div>
                <div className="mt-2 text-2xl font-semibold text-white md:text-3xl">
                  Nexus Drift // v{CURRENT_VERSION}
                </div>
                <p className="mt-2 max-w-2xl text-sm text-white/55 md:text-base">
                  Release notes rebuilt from the repo history, from the first rough prototype to the
                  current build.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChangelogOpen(false)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.24em] text-white/55 transition hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="max-h-[calc(min(720px,92vh)-112px)] space-y-4 overflow-y-auto px-5 py-4 md:px-6 md:py-5">
              {CHANGELOG.map((entry) => (
                <section
                  key={entry.version}
                  className="rounded-[28px] border border-white/10 bg-black/20 p-4 md:p-5"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-xl font-semibold text-white md:text-2xl">
                      v{entry.version}
                    </div>
                    <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-cyan-100/75">
                      {entry.badge}
                    </div>
                  </div>
                  <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                    {entry.summary}
                  </p>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {entry.sections.map((section) => (
                      <div
                        key={section.title}
                        className="rounded-3xl border border-white/10 bg-white/5 p-4"
                      >
                        <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">
                          {section.title}
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-white/72">
                          {section.items.map((item) => (
                            <p key={item} className="leading-6">
                              {item}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
