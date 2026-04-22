import { memo, type ComponentType, type CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Bot,
  Coins,
  Cpu,
  Crosshair,
  Diamond,
  ExternalLink,
  Gem,
  Hammer,
  Hexagon,
  Pickaxe,
  Radar,
  Rocket,
  Shield,
  Swords,
  Zap,
} from "lucide-react";
import { Background } from "@/components/Background";
import { useTooltip } from "@/hooks/useTooltip";
import { TooltipPanel } from "@/components/Tooltip";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { EventBackdrop } from "@/components/EventBackdrop";
import { EventChip } from "@/components/EventChip";
import { FieldStatsStrip } from "@/components/FieldStatsStrip";
import { FieldSvg } from "@/components/FieldSvg";
import { AdminPanel } from "@/components/AdminPanel";
import { ResourcePill, StatusBadge } from "@/components/HudPrimitives";
import { Sidebar } from "@/components/Sidebar";
import { UpgradeIndicatorRail } from "@/components/UpgradeIndicatorRail";
import { AchievementsModal } from "@/components/AchievementsModal";
import { WikiOverlay } from "@/components/WikiOverlay";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CHANGELOG, CURRENT_VERSION } from "@/changelog";
import { PANEL_CLASS } from "@/theme";
import {
  ACHIEVEMENT_DEFS,
  clickDyingEnemy,
  clickProjectile,
  completeManualOverride,
  inspectEventTag,
  recordAchievementsOpen,
  recordChangelogOpen,
  recoverLostDrone,
  spotTourist,
  unlockSecretAchievement,
  witnessAnomaly,
} from "@/game/achievements";
import type { AchievementId, AchievementRarity } from "@/game/achievements";
import { resourceDefs } from "@/game/data";
import { getEventDef } from "@/game/events/eventDefs";
import { loadSavedState, SAVE_KEY } from "@/game/persistence";
import type { UpgradeKey, VisibleResourceKey } from "@/game/types";
import { clamp, fmt, pushLog } from "@/game/utils";
import { ADMIN_SPEED_PRESETS } from "@/game/adminCommands";
import { useGameLoop } from "@/hooks/useGameLoop";
import { INITIAL_MANUAL_OVERRIDE_SEQUENCE, recordManualOverrideClick } from "@/lib/manualOverride";

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
  focusedBeam: Zap,
  missileLauncher: Rocket,
};

const PUBLIC_SPEEDS = [1, 2, 4] as const;
const SOURCE_URL = "https://gitlab.mdbook.me/mikayla/nexus-drift";
const SPEED_TOOLTIP: Record<number, string> = {
  1: "Normal speed — standard simulation rate.",
  2: "2× speed — double tick rate, useful for mid-game grinding.",
  4: "4× speed — fast-forward through long upgrade waits.",
  10: "10× speed — admin fast-forward for setup checks.",
  20: "20× speed — admin stress speed; watch active wave pressure.",
  100: "100× speed — admin burst mode with catch-up capped to protect frame time.",
};

function isPublicSpeed(value: number): value is (typeof PUBLIC_SPEEDS)[number] {
  return PUBLIC_SPEEDS.includes(value as (typeof PUBLIC_SPEEDS)[number]);
}

function SpeedButton({ value, active, onClick }: { value: number; active: boolean; onClick: () => void }) {
  const id = `speed-btn-${value}`;
  const { open, triggerRef, triggerProps, anchor } = useTooltip(id, 200);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={`${value}× game speed`}
        className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
          active
            ? "border-cyan-200/30 bg-white/12 text-white"
            : "border-transparent text-white/45 hover:text-white"
        }`}
        {...triggerProps}
      >
        {value}x
      </button>
      <TooltipPanel id={id} open={open} anchor={anchor} width={200}>
        <p className="text-xs leading-5 text-white/75">{SPEED_TOOLTIP[value]}</p>
      </TooltipPanel>
    </>
  );
}

function NewGameButton({ onClick }: { onClick: () => void }) {
  const id = "new-game-btn";
  const { open, triggerRef, triggerProps, anchor } = useTooltip(id, 200);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="text-xs text-white/40 transition-colors hover:text-white/75"
        onClick={onClick}
        {...triggerProps}
      >
        New Game
      </button>
      <TooltipPanel id={id} open={open} anchor={anchor} width={200} borderClass="border-rose-500/30">
        <p className="text-xs leading-5 text-white/75">Wipes your save and starts a fresh run.</p>
      </TooltipPanel>
    </>
  );
}

function HeaderControls({
  speed,
  setSpeed,
  speedOptions,
  onNewGame,
}: {
  speed: number;
  setSpeed: (value: number) => void;
  speedOptions: readonly number[];
  onNewGame: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-black/25 px-2 py-1 backdrop-blur-sm">
        {speedOptions.map((value) => (
          <SpeedButton key={value} value={value} active={speed === value} onClick={() => setSpeed(value)} />
        ))}
      </div>
      <NewGameButton onClick={onNewGame} />
    </div>
  );
}

const SectorStatusCard = memo(function SectorStatusCard({
  game,
  derived,
  xpPct,
}: {
  game: ReturnType<typeof useGameLoop>["uiGame"];
  derived: ReturnType<typeof useGameLoop>["uiDerived"];
  xpPct: number;
}) {
  return (
    <Card
      className={`order-5 ${PANEL_CLASS} p-3 lg:absolute lg:top-4 lg:right-6 lg:order-none lg:min-w-[380px]`}
    >
      <div className="hidden lg:flex lg:items-center lg:justify-between lg:gap-4">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-white">x{game.combo.toFixed(1)}</span>
          <span className="text-xs uppercase tracking-[0.2em] text-white/40">combo · lv {game.level}</span>
        </div>
        <Progress value={xpPct} className="h-1.5 w-24 bg-white/10" />
        <div className="flex gap-2">
          <StatusBadge tone={derived.hostilePressure ? "danger" : "calm"}>
            {derived.hostilePressure ? "Perimeter Hot" : "Stable"}
          </StatusBadge>
          <StatusBadge tone={derived.corruptionPressure ? "toxic" : "ready"}>
            {derived.corruptionPressure ? "Purge Wing Live" : "Corruption Low"}
          </StatusBadge>
        </div>
      </div>
      <div className="lg:hidden">
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
      </div>
    </Card>
  );
});

const ResourceBar = memo(function ResourceBar({
  game,
  derived,
}: {
  game: ReturnType<typeof useGameLoop>["uiGame"];
  derived: ReturnType<typeof useGameLoop>["uiDerived"];
}) {
  return (
    <div className="order-4 mb-2 grid grid-cols-2 gap-2 md:grid-cols-3 lg:order-3 lg:grid-cols-6">
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
  );
});
const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

export default function App() {
  const [speed, setSpeed] = useState(1);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [achievementFocusId, setAchievementFocusId] = useState<AchievementId | null>(null);
  const [synthwave, setSynthwave] = useState(false);
  const [initialGame] = useState(loadSavedState);
  const { open: adminOpen, setOpen: setAdminOpen } = useAdminPanel();
  const { game, derived, uiGame, uiDerived, mutateGame } = useGameLoop(initialGame, speed);
  const {
    liveVersion,
    updateAvailable,
    dismissForSession,
    ignoreVersion,
    showPreviewBanner,
    refreshForUpdate,
  } = useVersionCheck(CURRENT_VERSION);
  const konamiRef = useRef<string[]>([]);
  const driftRef = useRef("");
  const versionTapTimestamps = useRef<number[]>([]);
  const manualOverrideRef = useRef(INITIAL_MANUAL_OVERRIDE_SEQUENCE);
  const synthwaveRef = useRef(synthwave);
  useEffect(() => {
    synthwaveRef.current = synthwave;
  }, [synthwave]);
  const uiXpPct = clamp((uiGame.xp / Math.max(1, uiDerived.targetXp)) * 100, 0, 100);
  const uiStabilityPct = clamp(
    (uiDerived.defenseScore / Math.max(2, uiDerived.threatScore + 2)) * 100,
    0,
    100
  );
  const activeEventBackdropKey = derived.activeEvents.map((event) => event.id).join("|");
  const hasActiveEvents = derived.activeEvents.length > 0;
  const unlockedAchievementIds = (Object.keys(game.achievements) as AchievementId[]).reverse();
  const fieldFooterInsetClass = "mb-[124px] lg:mb-[83px]";
  const speedOptions = adminOpen || !isPublicSpeed(speed) ? ADMIN_SPEED_PRESETS : PUBLIC_SPEEDS;

  useEffect(() => {
    if (!changelogOpen && !achievementsOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Escape") return;
      setChangelogOpen(false);
      setAchievementsOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [achievementsOpen, changelogOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      konamiRef.current = [...konamiRef.current, event.key].slice(-KONAMI.length);
      driftRef.current = (driftRef.current + event.key).slice(-5).toLowerCase();

      if (driftRef.current === "drift") {
        mutateGame((next) => {
          next.log = pushLog(next.log, "The drift remembers.", "system", next.timers.tick);
          unlockSecretAchievement(next, "drift");
        });
        driftRef.current = "";
      }

      if (konamiRef.current.join(",") === KONAMI.join(",")) {
        const nextSynthwave = !synthwaveRef.current;
        setSynthwave(nextSynthwave);
        mutateGame((next) => {
          next.log = pushLog(
            next.log,
            nextSynthwave ? "Synthwave protocol engaged." : "Synthwave protocol disengaged.",
            "system",
            next.timers.tick
          );
          unlockSecretAchievement(next, "synthwave");
        });
        konamiRef.current = [];
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mutateGame]);

  const handleSpeedSelect = (value: number) => {
    const { sequence, unlocked } = recordManualOverrideClick(
      manualOverrideRef.current,
      speed,
      value,
      performance.now()
    );
    manualOverrideRef.current = sequence;
    setSpeed(value);

    if (!unlocked) return;

    mutateGame((next) => {
      completeManualOverride(next);
    });
  };

  const openChangelog = () => {
    mutateGame((next) => {
      recordChangelogOpen(next);
    });
    setChangelogOpen(true);
  };

  const openAchievements = (achievementId?: AchievementId) => {
    mutateGame((next) => {
      recordAchievementsOpen(next);
    });
    setAchievementFocusId(achievementId ?? null);
    setAchievementsOpen(true);
  };

  // 3.1.0 — stable FieldSvg interactions prop so the memoized FieldSvg doesn't
  // re-render on unrelated App-level state changes. mutateGame identity is
  // stable from useGameLoop, so the only real dep here is mutateGame itself.
  const fieldInteractions = useMemo(
    () => ({
      onTouristClick: () => {
        mutateGame((next) => {
          spotTourist(next);
        });
      },
      onLostDroneClick: () => {
        mutateGame((next) => {
          recoverLostDrone(next);
        });
      },
      onAnomalyClick: () => {
        mutateGame((next) => {
          witnessAnomaly(next);
        });
      },
      onProjectileClick: (projectileId: number) => {
        mutateGame((next) => {
          clickProjectile(next, projectileId);
        });
      },
      onEnemyClick: (enemyId: number) => {
        mutateGame((next) => {
          clickDyingEnemy(next, enemyId);
        });
      },
    }),
    [mutateGame]
  );

  const handleSynthwaveChange = (enabled: boolean) => {
    setSynthwave(enabled);
    mutateGame((next) => {
      next.log = pushLog(
        next.log,
        enabled ? "Admin: synthwave FX enabled." : "Admin: synthwave FX disabled.",
        "system",
        next.timers.tick
      );
    });
  };

  return (
    <div
      className={`relative min-h-[100dvh] bg-[#050814] text-white lg:h-[100dvh] lg:overflow-hidden ${
        synthwave ? "synthwave" : ""
      }`}
    >
      <Background />
      <EventBackdrop activeEventKey={activeEventBackdropKey} />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[1600px] flex-col p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-4 md:pb-[max(1rem,env(safe-area-inset-bottom))] lg:h-[100dvh] lg:max-w-[1920px] lg:px-6 lg:pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* header chrome — sector card is a separate flex item below on mobile, absolute top-right on lg */}
        <div className="mb-2">
          <div className="mb-2 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.35em] text-white/40">
            <span>Autonomous Colony Sim</span>
            <button
              type="button"
              onClick={() => {
                const now = Date.now();
                versionTapTimestamps.current = [
                  ...versionTapTimestamps.current.filter((ts) => now - ts < 2000),
                  now,
                ];
                if (versionTapTimestamps.current.length >= 5) {
                  versionTapTimestamps.current = [];
                  setAdminOpen((v) => !v);
                  return;
                }
                openChangelog();
              }}
              className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-medium tracking-[0.28em] text-cyan-100/85 transition hover:border-cyan-200/45 hover:bg-cyan-200/15 hover:text-cyan-50"
              aria-expanded={changelogOpen}
              aria-haspopup="dialog"
              aria-label={`Open changelog for version ${CURRENT_VERSION}`}
            >
              v{CURRENT_VERSION}
            </button>
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium tracking-[0.24em] text-white/55 transition hover:border-white/20 hover:bg-white/10 hover:text-white/85"
              aria-label="Open Nexus Drift source on GitLab"
            >
              <span>Source</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
          <h1 className="flex flex-wrap items-end gap-x-2 text-3xl font-semibold tracking-tight md:text-5xl lg:max-w-[calc(100%-420px)]">
            <span>NEXUS DRIFT</span>
            <span className="font-thin text-white/40"> //</span>
            <span className="ml-1 inline-flex flex-col items-start leading-none">
              <button
                type="button"
                onClick={() => setWikiOpen(true)}
                className="mb-1 inline-flex items-center gap-1 rounded-md border border-cyan-300/25 bg-cyan-300/5 px-1.5 py-0.5 text-[9px] font-medium tracking-[0.28em] text-cyan-200/75 uppercase transition hover:border-cyan-200/50 hover:bg-cyan-300/10 hover:text-cyan-100"
                aria-label="Open field archive"
                aria-haspopup="dialog"
                aria-expanded={wikiOpen}
              >
                <BookOpen className="h-3 w-3" />
                <span>archive</span>
              </button>
              <span className="text-sm font-medium tracking-widest text-white/60 uppercase md:text-base">
                purge wing online
              </span>
            </span>
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-white/55 md:text-base lg:hidden">
            Autonomous extraction in a contested sector. Miners work the nodes, corruptors rot the grid,
            raiders push the perimeter. The colony runs itself - your job is to keep it that way.
          </p>
          <HeaderControls
            speed={speed}
            setSpeed={handleSpeedSelect}
            speedOptions={speedOptions}
            onNewGame={() => {
              localStorage.removeItem(SAVE_KEY);
              window.location.reload();
            }}
          />
        </div>

        {updateAvailable && liveVersion && (
          <Card className="mb-3 border-emerald-300/20 bg-emerald-300/10 px-4 py-3 shadow-[0_0_40px_rgba(16,185,129,0.12)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.24em] text-emerald-100/60">
                  Live Update Available
                </div>
                <div className="mt-1 text-sm text-emerald-50/95 md:text-base">
                  Version {liveVersion} is live. You&apos;re currently on {CURRENT_VERSION}.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={refreshForUpdate}
                  className="rounded-xl border border-emerald-100/25 bg-emerald-100/15 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-emerald-50 transition hover:bg-emerald-100/20"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={dismissForSession}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-white/65 transition hover:bg-white/10 hover:text-white/85"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={ignoreVersion}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-white/65 transition hover:bg-white/10 hover:text-white/85"
                >
                  Don&apos;t Show Again
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* sector card — order-5 on mobile (below game+hud), absolute top-right on lg+ */}
        <SectorStatusCard game={uiGame} derived={uiDerived} xpPct={uiXpPct} />

        <div className="hidden lg:absolute lg:right-6 lg:top-[84px] lg:z-20 lg:block lg:w-full lg:max-w-[420px]">
          <Card className={`${PANEL_CLASS} overflow-hidden p-0`}>
            <UpgradeIndicatorRail
              game={game}
              derived={derived}
              upgradeIcons={upgradeIcons}
              tooltipPlacement="below"
            />
          </Card>
        </div>

        <ResourceBar game={uiGame} derived={uiDerived} />

        <div className="order-2 grid min-h-0 flex-1 grid-cols-1 gap-3 lg:order-4 lg:overflow-hidden lg:grid-cols-[1.45fr_0.85fr]">
          <Card className={`${PANEL_CLASS} relative flex min-w-0 flex-col overflow-hidden p-0 lg:h-full`}>
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

            {unlockedAchievementIds.length > 0 && (
              <div className="flex shrink-0 items-center gap-2 border-b border-white/5 px-4 py-1.5">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
                  {unlockedAchievementIds.map((id) => {
                    const def = ACHIEVEMENT_DEFS.find((entry) => entry.id === id);
                    const rarity: AchievementRarity = def?.rarity ?? "common";
                    const RARITY_BADGE: Record<AchievementRarity, string> = {
                      common: "border-white/15 bg-white/8 text-white/60",
                      uncommon: "border-cyan-400/25 bg-cyan-900/30 text-cyan-200/90",
                      rare: "border-violet-400/30 bg-violet-900/30 text-violet-200/90",
                      legendary: "border-amber-400/35 bg-amber-900/30 text-amber-200/90",
                    };
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] transition hover:bg-white/12 hover:text-white ${RARITY_BADGE[rarity]}`}
                        onClick={() => openAchievements(id)}
                        title={`Jump to ${def?.label ?? id} in achievements`}
                        aria-label={`Open achievements and focus ${def?.label ?? id}`}
                      >
                        {def?.label ?? id}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/35 transition hover:bg-white/10 hover:text-white/70"
                  onClick={() => openAchievements()}
                  title="View achievements"
                  aria-label={`Open achievements (${unlockedAchievementIds.length} of ${ACHIEVEMENT_DEFS.length} unlocked)`}
                >
                  {unlockedAchievementIds.length}/{ACHIEVEMENT_DEFS.length}
                </button>
              </div>
            )}

            <div className={`min-h-0 flex-1 overflow-hidden rounded-[20px] ${fieldFooterInsetClass}`}>
              <FieldSvg
                game={game}
                derived={derived}
                interactions={fieldInteractions}
              />
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-20 rounded-b-[28px] border-t border-white/5 bg-slate-950/80 backdrop-blur-sm">
              <div className="border-b border-white/5">
                <div className="flex flex-wrap gap-2 px-4 py-2 lg:flex-nowrap lg:overflow-x-auto lg:[scrollbar-width:none]">
                  {hasActiveEvents ? (
                    derived.activeEvents.map((event) => (
                      <EventChip
                        key={event.id}
                        event={event}
                        def={getEventDef(event.id)}
                        inspected={game.stats.eventTagsInspected.includes(event.id)}
                        onInspect={(eventId) => {
                          mutateGame((next) => {
                            inspectEventTag(next, eventId);
                          });
                        }}
                      />
                    ))
                  ) : (
                    <span className="text-xs text-white/25">No ongoing events</span>
                  )}
                </div>
              </div>
              <FieldStatsStrip game={game} derived={derived} />
              <div className="lg:hidden">
                <UpgradeIndicatorRail game={game} derived={derived} upgradeIcons={upgradeIcons} />
              </div>
            </div>
          </Card>

          <Sidebar
            game={uiGame}
            derived={uiDerived}
            upgradeIcons={upgradeIcons}
            stabilityPct={uiStabilityPct}
          />
        </div>
      </div>

      {adminOpen && (
        <AdminPanel
          game={game}
          derived={derived}
          speed={speed}
          synthwave={synthwave}
          mutateGame={mutateGame}
          onSpeedSelect={handleSpeedSelect}
          onShowPreviewBanner={showPreviewBanner}
          onSynthwaveChange={handleSynthwaveChange}
          onClose={() => setAdminOpen(false)}
        />
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
                  Release notes rebuilt from the repo history, from the first rough prototype to the current
                  build.
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
                    <div className="text-xl font-semibold text-white md:text-2xl">v{entry.version}</div>
                    <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-cyan-100/75">
                      {entry.badge}
                    </div>
                  </div>
                  <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">{entry.summary}</p>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {entry.sections.map((section) => (
                      <div key={section.title} className="rounded-3xl border border-white/10 bg-white/5 p-4">
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

      {achievementsOpen && (
        <AchievementsModal
          key={achievementFocusId ?? "all-achievements"}
          achievements={game.achievements}
          targetAchievementId={achievementFocusId}
          onClose={() => {
            setAchievementsOpen(false);
            setAchievementFocusId(null);
          }}
        />
      )}

      <WikiOverlay open={wikiOpen} onClose={() => setWikiOpen(false)} />
    </div>
  );
}
