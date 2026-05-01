/**
 * 3.2.2 — Unified notification system.
 *
 * One queue, one stack, one tick path. Achievements and enemy discoveries
 * funnel through `pushNotification`; future kinds (milestones, warnings,
 * generic info toasts) add a new variant to the discriminated union below
 * plus a render case in `NotificationStack`. The state lives on
 * `GameState.notifications` and is decremented every tick by
 * `tickNotifications` from the achievements subsystem.
 *
 * Adding a new notification kind:
 *   1. Add a new variant to the `Notification` union below.
 *   2. Add a builder helper (e.g. `buildMilestoneNotification`).
 *   3. Add a render case in `NotificationStack.tsx`.
 *
 * Visibility model — at most `NOTIFICATION_VISIBLE_LIMIT` entries are
 * "active" (visible + counting down) at once. Anything pushed beyond that
 * sits in an invisible queue with its timer paused; when an active slot
 * frees up the next queued entry is promoted automatically. All entries
 * carry a stable `id` so re-pushes are idempotent.
 */

import type { AchievementId, AchievementRarity } from "@/game/achievements";
import type { EnemyKind, GameState } from "@/game/types";

export type NotificationTone = "common" | "uncommon" | "rare" | "legendary" | "combat" | "void" | "info";

export type AchievementNotification = {
  kind: "achievement";
  id: string;
  achievementId: AchievementId;
  tone: AchievementRarity;
  ticks: number;
  maxTicks: number;
};

export type EnemyDiscoveredNotification = {
  kind: "enemy-discovered";
  id: string;
  enemyKind: EnemyKind;
  tone: "combat" | "void";
  ticks: number;
  maxTicks: number;
};

export type Notification = AchievementNotification | EnemyDiscoveredNotification;

export type NotificationKind = Notification["kind"];

/** How many notifications are "active" (visible + ticking down) at once. */
export const NOTIFICATION_VISIBLE_LIMIT = 3;

/** Sim ticks at TICK_MS = 33. ~15s fade matches the user-facing dwell target. */
export const NOTIFICATION_TICKS_DEFAULT = 450;
/** Legendary unlocks hold a touch longer for emphasis. */
export const NOTIFICATION_TICKS_LEGENDARY = 540;
/** Discovery cards expose an action button (View archive); give them the same dwell. */
export const NOTIFICATION_TICKS_DISCOVERY = 450;

const VOID_ENEMY_KINDS = new Set<EnemyKind>(["corruptor", "blight", "warden"]);

export function buildAchievementNotification(
  achievementId: AchievementId,
  rarity: AchievementRarity
): AchievementNotification {
  const maxTicks = rarity === "legendary" ? NOTIFICATION_TICKS_LEGENDARY : NOTIFICATION_TICKS_DEFAULT;
  return {
    kind: "achievement",
    id: `ach:${achievementId}`,
    achievementId,
    tone: rarity,
    ticks: maxTicks,
    maxTicks,
  };
}

export function buildEnemyDiscoveredNotification(enemyKind: EnemyKind): EnemyDiscoveredNotification {
  return {
    kind: "enemy-discovered",
    id: `enemy:${enemyKind}`,
    enemyKind,
    tone: VOID_ENEMY_KINDS.has(enemyKind) ? "void" : "combat",
    ticks: NOTIFICATION_TICKS_DISCOVERY,
    maxTicks: NOTIFICATION_TICKS_DISCOVERY,
  };
}

/** Idempotent push — same id is never enqueued twice. Returns true when added. */
export function pushNotification(state: GameState, notification: Notification): boolean {
  if (state.notifications.some((entry) => entry.id === notification.id)) return false;
  state.notifications = [...state.notifications, notification];
  return true;
}

/** Remove a notification by id. No-op if not present. */
export function dismissNotification(state: GameState, id: string): void {
  if (!state.notifications.some((entry) => entry.id === id)) return;
  state.notifications = state.notifications.filter((entry) => entry.id !== id);
}

/**
 * Decrement the timer on each currently visible (active) notification and drop
 * any that expire. Queued entries beyond the visible limit hold their full
 * timer until they're promoted into the visible window — so a long burst of
 * unlocks doesn't silently expire while waiting in line.
 */
export function tickNotifications(state: GameState): void {
  if (state.notifications.length === 0) return;
  const next: Notification[] = [];
  for (let i = 0; i < state.notifications.length; i++) {
    const entry = state.notifications[i];
    if (i >= NOTIFICATION_VISIBLE_LIMIT) {
      next.push(entry);
      continue;
    }
    if (entry.ticks <= 1) continue;
    next.push({ ...entry, ticks: entry.ticks - 1 });
  }
  state.notifications = next;
}
