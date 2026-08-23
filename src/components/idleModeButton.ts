import type { GameState } from "@/game/types";

/**
 * 4.1.0 — the sidebar "Idle Mode" control. When the autobuy master is "all" the
 * colony is in the classic hands-off idle sim, so the control reads as a LIT
 * status indicator ("mode: idle / hands-off") rather than a plain button; when it
 * is not "all" it renders as a normal button. It always stays a toggle.
 *
 * Pure helpers (no React) so the active-state logic is unit-testable in the
 * node test env without rendering the component. `active` is the single source of
 * truth and equals `game.upgradeAutoMaster === "all"`.
 */
export function isIdleModeActive(master: GameState["upgradeAutoMaster"]): boolean {
  return master === "all";
}

/** Tailwind classes for the Idle Mode button. Active = lit/glowing emerald (the
 *  existing `ready` tone), inactive = the standard muted button. */
export function idleModeButtonClass(active: boolean): string {
  const base =
    "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-[10px] font-medium uppercase tracking-[0.18em] transition-colors";
  const state = active
    ? "border-emerald-300/40 bg-emerald-300/20 text-emerald-100 shadow-[0_0_12px_rgba(110,231,183,0.45)] ring-1 ring-emerald-300/30"
    : "border-white/10 bg-white/5 text-white/45 hover:text-white/75";
  return `${base} ${state}`;
}

/** Classes for the small leading status dot: a glowing emerald pip when lit,
 *  a dim pip otherwise. */
export function idleModeDotClass(active: boolean): string {
  return active
    ? "h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_6px_rgba(110,231,183,0.9)]"
    : "h-1.5 w-1.5 rounded-full bg-white/25";
}
