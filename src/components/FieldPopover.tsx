import { useLayoutEffect, useRef, useState } from "react";
import { CITY_HP } from "@/game/balance";
import { TICK_WRAP } from "@/game/constants";
import { isCloaked } from "@/game/enemyUtils";
import { isPriorityMarked } from "@/game/interactions";
import type { DerivedState, GameState } from "@/game/types";
import { clamp } from "@/game/utils";

/**
 * 4.0 Phase 3 — inspect popover for field entities. One popover is open at a
 * time (App.tsx owns the open/closed state). Fixed-positioned and viewport-
 * anchored per layout.md §Tooltip Conventions, because the popover sits over the
 * `overflow-hidden` field card and an `absolute` panel would clip. The worker /
 * enemy variants carry a single soft-nudge action button; the city variant is
 * read-only. Live data is read from the throttled `game`/`derived` snapshot by
 * id, so an entity that dies while inspected simply renders "no longer on the
 * field" instead of stale numbers.
 */

/** Which entity this popover is inspecting. Ids are entity ids (city has none). */
export type PopoverTarget = { kind: "worker"; id: number } | { kind: "city" } | { kind: "enemy"; id: number };

type FieldPopoverProps = {
  target: PopoverTarget;
  /** Viewport coordinates of the originating click, used to anchor the panel. */
  anchor: { x: number; y: number };
  game: GameState;
  derived: DerivedState;
  onClose: () => void;
  onSendHome: (agentId: number) => void;
  onMarkPriority: (enemyId: number) => void;
};

const PANEL_WIDTH = 232;
const GAP = 12;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-white/45">{label}</span>
      <span className="font-medium text-white/85">{value}</span>
    </div>
  );
}

function Bar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full" style={{ width: `${clamp(pct, 0, 100)}%`, background: tone }} />
    </div>
  );
}

export function FieldPopover({
  target,
  anchor,
  game,
  derived,
  onClose,
  onSendHome,
  onMarkPriority,
}: FieldPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Anchor at the click point, then clamp into the viewport once measured so the
  // panel never spills off an edge (flips left / above when it would overflow).
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: anchor.x + GAP,
    top: anchor.y + GAP,
  });

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = anchor.x + GAP + width > vw ? anchor.x - GAP - width : anchor.x + GAP;
    const top = anchor.y + GAP + height > vh ? anchor.y - GAP - height : anchor.y + GAP;
    setPos({
      left: clamp(left, GAP, Math.max(GAP, vw - width - GAP)),
      top: clamp(top, GAP, Math.max(GAP, vh - height - GAP)),
    });
  }, [anchor.x, anchor.y, target]);

  return (
    // Full-viewport catch layer: clicking anywhere outside the panel closes it,
    // enforcing the one-popover-at-a-time rule.
    <div className="fixed inset-0 z-50" onClick={onClose} role="presentation">
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Field inspector"
        className="fixed rounded-2xl border border-cyan-300/20 bg-slate-950/95 p-3 shadow-[0_0_40px_rgba(4,10,26,0.6)] backdrop-blur-md"
        style={{ left: pos.left, top: pos.top, width: PANEL_WIDTH }}
        onClick={(event) => event.stopPropagation()}
      >
        {target.kind === "worker" && (
          <WorkerBody game={game} agentId={target.id} onSendHome={onSendHome} onClose={onClose} />
        )}
        {target.kind === "city" && <CityBody game={game} derived={derived} />}
        {target.kind === "enemy" && (
          <EnemyBody game={game} enemyId={target.id} onMarkPriority={onMarkPriority} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-2">
      <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-100/55">{sub}</div>
      <div className="mt-0.5 text-sm font-semibold text-white">{title}</div>
    </div>
  );
}

function Gone({ label }: { label: string }) {
  return (
    <>
      <Header title={label} sub="Inspector" />
      <p className="text-xs text-white/45">This unit is no longer on the field.</p>
    </>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  tone = "cyan",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "cyan" | "amber";
}) {
  const active =
    tone === "amber"
      ? "border-amber-300/30 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20"
      : "border-cyan-300/30 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mt-3 w-full rounded-xl border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] transition-colors ${
        disabled ? "cursor-not-allowed border-white/10 bg-white/5 text-white/30" : active
      }`}
    >
      {label}
    </button>
  );
}

function WorkerBody({
  game,
  agentId,
  onSendHome,
  onClose,
}: {
  game: GameState;
  agentId: number;
  onSendHome: (id: number) => void;
  onClose: () => void;
}) {
  const agent = game.agents.find((a) => a.id === agentId);
  if (!agent || !agent.active) return <Gone label="Worker" />;

  const hpPct = agent.maxHp > 0 ? (agent.hp / agent.maxHp) * 100 : 0;
  const hpTone = hpPct < 30 ? "rgba(255,120,120,0.9)" : "rgba(120,220,255,0.85)";
  return (
    <>
      <Header title={`${agent.kind[0].toUpperCase()}${agent.kind.slice(1)} #${agent.id}`} sub="Worker" />
      <div className="space-y-1.5">
        <Row label="Task" value={agent.task} />
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-white/45">HP</span>
            <span className="font-medium text-white/85">
              {Math.round(agent.hp)} / {agent.maxHp}
            </span>
          </div>
          <Bar pct={hpPct} tone={hpTone} />
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70">
            speed ×{agent.speedMod.toFixed(2)}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70">
            fear ×{agent.fearMod.toFixed(2)}
          </span>
        </div>
      </div>
      <ActionButton
        label="Send home"
        onClick={() => {
          onSendHome(agent.id);
          onClose();
        }}
      />
    </>
  );
}

function CityBody({ game, derived }: { game: GameState; derived: DerivedState }) {
  const city = game.city;
  const hpPct = city.maxHp > 0 ? (city.hp / city.maxHp) * 100 : 0;
  const ticksSinceHostile = (game.timers.tick - city.lastHostileTick + TICK_WRAP) % TICK_WRAP;
  const regenerating = city.hp < city.maxHp && ticksSinceHostile >= CITY_HP.regenIdleTicks;
  const energyFactor = CITY_HP.energyMinRatio + (1 - CITY_HP.energyMinRatio) * derived.cityIntegrity;
  return (
    <>
      <Header title="Home District" sub="City Core" />
      <div className="space-y-1.5">
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-white/45">Integrity</span>
            <span className="font-medium text-white/85">
              {Math.round(city.hp)} / {city.maxHp}
            </span>
          </div>
          <Bar pct={hpPct} tone={hpPct < 35 ? "rgba(255,120,100,0.92)" : "rgba(160,220,255,0.82)"} />
        </div>
        <Row
          label="Regen"
          value={regenerating ? `+${CITY_HP.regenPerTick}/tick` : `${CITY_HP.regenPerTick}/tick (paused)`}
        />
        <Row
          label="Last hostile"
          value={city.lastHostileTick === 0 ? "no contact yet" : `${ticksSinceHostile} ticks ago`}
        />
        <Row label="Energy factor" value={`×${energyFactor.toFixed(2)}`} />
      </div>
    </>
  );
}

function EnemyBody({
  game,
  enemyId,
  onMarkPriority,
  onClose,
}: {
  game: GameState;
  enemyId: number;
  onMarkPriority: (id: number) => void;
  onClose: () => void;
}) {
  const enemy = game.enemies.find((e) => e.id === enemyId);
  if (!enemy || enemy.hp <= 0) return <Gone label="Contact" />;

  const hpPct = enemy.maxHp > 0 ? (enemy.hp / enemy.maxHp) * 100 : 0;
  const hasShield = enemy.shieldMax !== undefined && enemy.shieldMax > 0;
  const shieldPct = hasShield ? ((enemy.shield ?? 0) / enemy.shieldMax!) * 100 : 0;
  const cloaked = isCloaked(enemy);
  const alreadyMarked = isPriorityMarked(game, enemy.id);
  return (
    <>
      <Header title={`${enemy.kind[0].toUpperCase()}${enemy.kind.slice(1)}`} sub="Hostile Contact" />
      <div className="space-y-1.5">
        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-white/45">HP</span>
            <span className="font-medium text-white/85">
              {Math.round(enemy.hp)} / {enemy.maxHp}
            </span>
          </div>
          <Bar pct={hpPct} tone="rgba(255,120,120,0.9)" />
        </div>
        {hasShield && (
          <div>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="text-white/45">Shield</span>
              <span className="font-medium text-white/85">
                {Math.round(enemy.shield ?? 0)} / {enemy.shieldMax}
              </span>
            </div>
            <Bar pct={shieldPct} tone="rgba(120,200,255,0.85)" />
          </div>
        )}
        <Row label="Threat" value={enemy.archetype} />
        <Row label="Cloak" value={cloaked ? "cloaked" : "visible"} />
      </div>
      <ActionButton
        label={alreadyMarked ? "Priority marked" : "Mark priority"}
        tone="amber"
        disabled={alreadyMarked}
        onClick={() => {
          onMarkPriority(enemy.id);
          onClose();
        }}
      />
    </>
  );
}
