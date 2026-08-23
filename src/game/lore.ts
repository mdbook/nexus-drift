import { ENEMY_ARCHETYPE } from "@/game/balance";
import type { EnemyKind, GameState } from "@/game/types";

// ─── Archive lore unlocks ─────────────────────────────────────────────────────
//
// The Field Archive ships two kinds of entry: always-visible dossiers (enemies,
// resources, defenses, operations, events, and the baseline World Lore) and
// *gated* entries that stay redacted until the player earns them. This module
// owns the gating LOGIC only; the entry CONTENT (title, lore, hint copy) lives
// beside the rest of the archive in `WikiOverlay.tsx`.
//
// Design note — no new save field. Every unlock predicate is a PURE function of
// existing, already-persisted GameState signals (achievements, monotonic stat
// counters, prestige, discoveredEnemies, eventsExperienced, lostWorkerFound).
// All of those are append-only / never-decreasing, so a derived unlock is
// effectively permanent and rides the existing save with zero schema churn and
// zero migration risk. A loaded save simply recomputes its unlock set from the
// signals it already carries; an old save missing a signal just reads "locked",
// which is correct and never crashes.

export type LoreUnlock = {
  /** One-line, in-tone recovery condition shown on the redacted entry. */
  hint: string;
  /** True once the player has earned this entry. Must stay monotonic. */
  test: (g: GameState) => boolean;
};

/** All twelve hostile signatures, derived from the canonical archetype table. */
export const ALL_ENEMY_KINDS = Object.keys(ENEMY_ARCHETYPE) as EnemyKind[];

/** Every enemy kind has been logged at least once this save. */
function bestiaryComplete(g: GameState): boolean {
  return ALL_ENEMY_KINDS.every((kind) => Boolean(g.discoveredEnemies[kind]));
}

/**
 * Gated archive entries, keyed by the WikiEntry id they unlock. The key set
 * here MUST match the set of `hidden: true` entries in `WikiOverlay.tsx`
 * exactly — `lore.test.ts` asserts that parity so content and logic cannot
 * drift apart.
 */
export const LORE_UNLOCKS: Record<string, LoreUnlock> = {
  // ── World Lore (gated) ───────────────────────────────────────────────────────
  "lore-first-shift": {
    hint: "Keep the colony alive for 30 minutes.",
    test: (g) => Boolean(g.achievements.survived_30m),
  },
  "lore-crews": {
    hint: "Fold the colony once — prestige at least one time.",
    test: (g) => g.prestige >= 1,
  },
  "lore-recursion": {
    hint: "Prestige three times. The loop shows itself to those who repeat it.",
    test: (g) => Boolean(g.achievements.prestige_3),
  },
  "lore-cores": {
    hint: "Recover your first Core fragment — break a Brute.",
    test: (g) => Boolean(g.achievements.first_core),
  },
  "lore-flux": {
    hint: "Complete your first node purge.",
    test: (g) => Boolean(g.achievements.first_purge),
  },

  // ── Classified / secrets ─────────────────────────────────────────────────────
  "sec-residual": {
    hint: "Some signals only answer when the field goes quiet. Listen for the drift.",
    test: (g) => Boolean(g.achievements.drift_heard),
  },
  "sec-synthwave": {
    hint: "Engage the synthwave protocol.",
    test: (g) => Boolean(g.achievements.synthwave),
  },
  "sec-passenger": {
    hint: "Notice the visitor who doesn't belong on the field.",
    test: (g) => Boolean(g.achievements.tourist_spotted),
  },
  "sec-wrk00": {
    hint: "Recover the drone that was never entered in the manifest.",
    test: (g) => g.lostWorkerFound === true,
  },
  "sec-pattern": {
    hint: "Log every hostile signature in the sector — all twelve.",
    test: bestiaryComplete,
  },
  "sec-devnote": {
    hint: "Read the colony's own changelog to the end.",
    test: (g) => Boolean(g.achievements.release_reader),
  },
  "sec-outbreak": {
    hint: "Survive a corrupted-worker outbreak and come out the other side.",
    test: (g) => Boolean(g.achievements.void_outbreak),
  },
  "sec-deepwatch": {
    hint: "Keep the colony alive for four unbroken hours.",
    test: (g) => Boolean(g.achievements.survived_4h),
  },
  "sec-null": {
    hint: "Witness a Null Surge — the moment every turret goes dark at once.",
    test: (g) => g.stats.eventsExperienced.includes("null_surge"),
  },
  "sec-starcall": {
    hint: "Witness a Starcall.",
    test: (g) => g.stats.eventsExperienced.includes("starcall"),
  },
};

/**
 * Compute the set of currently-unlocked gated archive entry ids for a given
 * game state. Cheap (a handful of primitive reads) and pure — safe to call on
 * every render; the Field Archive only reads it while open.
 */
export function computeUnlockedLore(g: GameState): Set<string> {
  const unlocked = new Set<string>();
  for (const id of Object.keys(LORE_UNLOCKS)) {
    if (LORE_UNLOCKS[id].test(g)) unlocked.add(id);
  }
  return unlocked;
}
