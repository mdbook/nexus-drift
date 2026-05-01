import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_VISIBLE_LIMIT,
  buildAchievementNotification,
  buildEnemyDiscoveredNotification,
  dismissNotification,
  pushNotification,
  tickNotifications,
} from "@/game/notifications";
import { createInitialGameState } from "@/game/factories";

describe("unified notifications", () => {
  it("push is idempotent by stable id", () => {
    const state = createInitialGameState();
    expect(pushNotification(state, buildAchievementNotification("first_core", "common"))).toBe(true);
    expect(pushNotification(state, buildAchievementNotification("first_core", "common"))).toBe(false);
    expect(state.notifications).toHaveLength(1);
  });

  it("dismiss removes by id", () => {
    const state = createInitialGameState();
    pushNotification(state, buildEnemyDiscoveredNotification("wisp"));
    dismissNotification(state, "enemy:wisp");
    expect(state.notifications).toHaveLength(0);
  });

  it("only the first NOTIFICATION_VISIBLE_LIMIT entries tick down", () => {
    const state = createInitialGameState();
    pushNotification(state, buildAchievementNotification("first_core", "common"));
    pushNotification(state, buildAchievementNotification("cores_50", "uncommon"));
    pushNotification(state, buildAchievementNotification("flux_100", "uncommon"));
    pushNotification(state, buildAchievementNotification("kill_10_enemies", "common"));
    pushNotification(state, buildAchievementNotification("kill_100_enemies", "uncommon"));

    expect(state.notifications).toHaveLength(5);
    const queuedBefore = state.notifications[NOTIFICATION_VISIBLE_LIMIT].ticks;
    const visibleBefore = state.notifications[0].ticks;

    tickNotifications(state);

    expect(state.notifications[0].ticks).toBe(visibleBefore - 1);
    expect(state.notifications[NOTIFICATION_VISIBLE_LIMIT].ticks).toBe(queuedBefore);
  });

  it("queued entries promote into the visible window after expiry", () => {
    const state = createInitialGameState();
    pushNotification(state, buildAchievementNotification("first_core", "common"));
    pushNotification(state, buildAchievementNotification("cores_50", "uncommon"));
    pushNotification(state, buildAchievementNotification("flux_100", "uncommon"));
    pushNotification(state, buildAchievementNotification("kill_10_enemies", "common"));

    state.notifications[0].ticks = 1;
    tickNotifications(state);

    expect(state.notifications).toHaveLength(3);
    expect(state.notifications.map((n) => n.id)).not.toContain("ach:first_core");
    expect(state.notifications.map((n) => n.id)).toContain("ach:kill_10_enemies");
  });
});
