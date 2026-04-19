import { CORRUPTION } from "@/game/balance";
import type { GameState } from "@/game/types";
import { clamp, dist } from "@/game/utils";

export function stepCorruption(state: GameState) {
  state.nodes.forEach((node) => {
    node.pulse = (node.pulse + 0.04 + node.corruption * 0.002) % (Math.PI * 2);
    const corruptorAttached = state.enemies.some(
      (enemy) =>
        enemy.role === "corruptor" &&
        enemy.targetNodeId === node.id &&
        dist(enemy.x, enemy.y, node.x, node.y) <= node.size + CORRUPTION.attachRadius
    );

    if (!corruptorAttached && node.corruption > 0) {
      const purgeRate = CORRUPTION.purgeBase + state.upgrades.arsenal * CORRUPTION.purgePerArsenal + state.upgrades.shield * CORRUPTION.purgePerShield;
      node.corruption = clamp(node.corruption - purgeRate, 0, 100);
      node.corruptedBy = null;
      if (node.corruption <= CORRUPTION.purgeThreshold) {
        node.corrupted = false;
        node.corruptedBy = null;
      }
    }
  });
}
