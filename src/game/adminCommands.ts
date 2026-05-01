import { WARDEN } from "@/game/balance";
import { upgradeDefs } from "@/game/data";
import { activateEvent, EVENT_DEFS, getEventDef, recomputeEventModifiers } from "@/game/events/eventDefs";
import { recordEnemyDiscovery, spawnEnemy } from "@/game/factories";
import { computeDerived } from "@/game/selectors";
import type { EnemyKind, GameState, ResourceKey, UpgradeKey } from "@/game/types";
import { fmt, appendLog } from "@/game/utils";

export const ADMIN_SPEED_PRESETS = [1, 2, 4, 10, 20, 100] as const;
export type AdminSpeedPreset = (typeof ADMIN_SPEED_PRESETS)[number];

export const ADMIN_COMMAND_HELP = [
  "help - list admin commands",
  "status - summarize the current run",
  "speed <1|2|4|10|20|100> - switch the shared speed selector",
  "grant <resource|all> <amount> - add resources",
  "upgrade <key|all> [level|+amount] - set or bump upgrades",
  "level <value> - set sector level",
  "xp <amount> - set current XP",
  "event <eventId|list> - trigger an event card",
  "spawn <enemyKind|list> [count] [wave] - spawn enemies with seeded RNG",
  "heal <workers|defense|city|all> - restore HP and clear disabled/broken states",
  "clear <enemies|events|projectiles|corruption|log> - remove debug state",
  "preset <midgame|lategame|siege> - jump to a useful testing setup",
  "banner - show the update banner preview",
];

export type AdminCommandResult = {
  ok: boolean;
  message: string;
  changed?: boolean;
  requestedSpeed?: AdminSpeedPreset;
  showPreviewBanner?: boolean;
};

const RESOURCE_KEYS = [
  "gold",
  "ore",
  "gems",
  "energy",
  "cores",
  "flux",
] as const satisfies readonly ResourceKey[];
const ENEMY_KINDS = [
  "mite",
  "raider",
  "wisp",
  "corruptor",
  "rusher",
  "brute",
  "sapper",
  "blight",
  "leech",
  "phantom",
  "zapper",
  "warden",
] as const satisfies readonly EnemyKind[];
const UPGRADE_KEYS = upgradeDefs.map((def) => def.key);
const MAX_RESOURCE_AMOUNT = 1_000_000_000;
const MAX_UPGRADE_LEVEL = 99;
const MAX_SPAWN_COUNT = 50;
const MAX_WAVE_POWER = 500;

function ok(message: string, extra: Omit<AdminCommandResult, "ok" | "message"> = {}): AdminCommandResult {
  return { ok: true, message, ...extra };
}

function fail(message: string): AdminCommandResult {
  return { ok: false, message };
}

function isResourceKey(value: string): value is ResourceKey {
  return RESOURCE_KEYS.includes(value as ResourceKey);
}

function isEnemyKind(value: string): value is EnemyKind {
  return ENEMY_KINDS.includes(value as EnemyKind);
}

function isUpgradeKey(value: string): value is UpgradeKey {
  return UPGRADE_KEYS.includes(value as UpgradeKey);
}

export function isAdminSpeedPreset(value: number): value is AdminSpeedPreset {
  return ADMIN_SPEED_PRESETS.includes(value as AdminSpeedPreset);
}

function parseNumber(
  raw: string | undefined,
  label: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
): { ok: true; value: number } | { ok: false; message: string } {
  if (raw === undefined || raw.trim() === "") {
    return { ok: false, message: `Missing ${label}.` };
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { ok: false, message: `Invalid ${label}: ${raw}` };
  }

  const min = options.min ?? -Infinity;
  const max = options.max ?? Infinity;
  const normalized = options.integer ? Math.floor(value) : value;
  if (normalized < min || normalized > max) {
    return { ok: false, message: `${label} must be between ${fmt(min)} and ${fmt(max)}.` };
  }

  return { ok: true, value: normalized };
}

function parseUpgradeTarget(current: number, raw: string | undefined) {
  if (raw === undefined) {
    return { ok: true as const, value: Math.min(MAX_UPGRADE_LEVEL, current + 1) };
  }

  const relative = raw.startsWith("+");
  const parsed = parseNumber(relative ? raw.slice(1) : raw, "upgrade level", {
    min: 0,
    max: MAX_UPGRADE_LEVEL,
    integer: true,
  });
  if (!parsed.ok) return parsed;

  const value = relative ? Math.min(MAX_UPGRADE_LEVEL, current + parsed.value) : parsed.value;
  return { ok: true as const, value };
}

function resetActiveEvents(state: GameState) {
  for (const active of state.activeEvents) {
    if (!active.revertOnExpire) continue;
    const def = getEventDef(active.id);
    def?.revert(state);
  }
  state.activeEvents = [];
  recomputeEventModifiers(state);
}

function clearCorruption(state: GameState) {
  for (const node of state.nodes) {
    node.corruption = 0;
    node.corrupted = false;
    node.corruptedBy = null;
  }

  for (const agent of state.agents) {
    agent.corrupted = false;
    agent.corruptionTicks = 0;
    agent.corruptingTicks = 0;
    agent.spottedTicks = 0;
    // Restore maxHp to the baseline (undo the corruption toughness boost) and
    // clamp hp so we never leave a worker with hp > maxHp after the reset.
    agent.maxHp = WARDEN.workerBaseHp;
    agent.hp = Math.min(agent.hp, agent.maxHp);
    if (agent.rebootTicks > 0) {
      agent.rebootTicks = 0;
      agent.hp = agent.maxHp;
    }
  }
}

function healWorkers(state: GameState) {
  for (const agent of state.agents) {
    agent.hp = agent.maxHp;
    agent.panic = 0;
    agent.evadeTicks = 0;
    agent.damageTicks = 0;
    agent.disabledTicks = 0;
    agent.rebootTicks = 0;
  }
}

function healDefense(state: GameState) {
  for (const turret of state.turrets) {
    turret.hp = turret.maxHp;
    turret.damageTicks = 0;
    turret.disabledTicks = 0;
    turret.brokenTicks = 0;
  }

  for (const scout of state.scouts) {
    scout.hp = scout.maxHp;
    scout.damageTicks = 0;
    scout.retreating = false;
    scout.rebootTicks = 0;
  }

  for (const sentinel of state.sentinels) {
    sentinel.hp = sentinel.maxHp;
    sentinel.damageTicks = 0;
    sentinel.retreating = false;
    sentinel.rebootTicks = 0;
  }
}

function healCity(state: GameState) {
  state.city.hp = state.city.maxHp;
  state.city.damageTicks = 0;
}

function applyPreset(state: GameState, preset: string) {
  switch (preset) {
    case "midgame": {
      state.level = Math.max(state.level, 18);
      state.xp = Math.max(state.xp, 500);
      state.resources.gold += 15_000;
      state.resources.ore += 4_000;
      state.resources.gems += 900;
      state.resources.energy += 900;
      state.resources.flux += 120;
      state.resources.cores += 30;
      state.upgrades.miner = Math.max(state.upgrades.miner, 4);
      state.upgrades.drill = Math.max(state.upgrades.drill, 4);
      state.upgrades.reactor = Math.max(state.upgrades.reactor, 3);
      state.upgrades.bot = Math.max(state.upgrades.bot, 3);
      state.upgrades.turret = Math.max(state.upgrades.turret, 2);
      state.upgrades.shield = Math.max(state.upgrades.shield, 2);
      state.upgrades.scout = Math.max(state.upgrades.scout, 2);
      state.upgrades.arsenal = Math.max(state.upgrades.arsenal, 2);
      state.upgrades.missileLauncher = Math.max(state.upgrades.missileLauncher, 1);
      break;
    }
    case "lategame": {
      state.level = Math.max(state.level, 48);
      state.xp = Math.max(state.xp, 2_000);
      state.prestige = Math.max(state.prestige, 2);
      state.resources.gold += 250_000;
      state.resources.ore += 85_000;
      state.resources.gems += 12_000;
      state.resources.energy += 14_000;
      state.resources.flux += 600;
      state.resources.cores += 160;
      for (const key of UPGRADE_KEYS) {
        state.upgrades[key] = Math.max(state.upgrades[key], key === "missileLauncher" ? 5 : 7);
      }
      break;
    }
    case "siege": {
      state.level = Math.max(state.level, 32);
      state.resources.gold += 25_000;
      state.resources.energy += 3_000;
      state.upgrades.turret = Math.max(state.upgrades.turret, 3);
      state.upgrades.shield = Math.max(state.upgrades.shield, 3);
      state.upgrades.scout = Math.max(state.upgrades.scout, 2);
      state.upgrades.sentinel = Math.max(state.upgrades.sentinel, 1);
      state.upgrades.missileLauncher = Math.max(state.upgrades.missileLauncher, 2);
      for (const kind of ["brute", "sapper", "leech", "zapper", "corruptor", "warden"] as const) {
        state.enemies.push(spawnEnemy(state.rng, state.nextEnemyId++, state.level, kind, state.timers.tick));
        recordEnemyDiscovery(state, kind);
      }
      break;
    }
    default:
      return fail(`Unknown preset "${preset}". Use: midgame, lategame, siege.`);
  }

  appendLog(state, `Admin preset applied: ${preset}.`, "system");
  return ok(`Applied ${preset} preset.`, { changed: true });
}

function status(state: GameState) {
  const derived = computeDerived(state);
  const activeWorkers = state.agents.filter((agent) => agent.active).length;
  const resources = RESOURCE_KEYS.map((key) => `${key} ${fmt(state.resources[key])}`).join(", ");
  return ok(
    [
      `tick ${state.timers.tick} · level ${state.level} · prestige ${state.prestige}`,
      `tier ${derived.progression.tier} (${derived.progression.label}) · score ${derived.progression.score.toFixed(1)}`,
      `workers ${activeWorkers}/${state.agents.length} · enemies ${state.enemies.length} · events ${state.activeEvents.length}`,
      `city ${(derived.cityIntegrity * 100).toFixed(0)}% · corruption nodes ${derived.activeCorruptionNodes} · corrupted workers ${derived.corruptedWorkers}`,
      resources,
    ].join("\n")
  );
}

export function executeAdminCommand(state: GameState, input: string): AdminCommandResult {
  const trimmed = input.trim();
  if (!trimmed) return fail("Enter a command. Type help for options.");

  const [rawCommand, ...args] = trimmed.split(/\s+/);
  const command = rawCommand.toLowerCase();

  if (command === "help" || command === "?") {
    return ok(ADMIN_COMMAND_HELP.join("\n"));
  }

  if (command === "status") {
    return status(state);
  }

  if (command === "speed") {
    const parsed = parseNumber(args[0], "speed", { min: 1, max: 100, integer: true });
    if (!parsed.ok) return fail(parsed.message);
    if (!isAdminSpeedPreset(parsed.value)) {
      return fail(`Unsupported speed ${parsed.value}x. Use one of: ${ADMIN_SPEED_PRESETS.join(", ")}.`);
    }
    return ok(`Speed request: ${parsed.value}x.`, { requestedSpeed: parsed.value });
  }

  if (command === "banner") {
    return ok("Update banner preview requested.", { showPreviewBanner: true });
  }

  if (command === "grant") {
    const target = args[0]?.toLowerCase();
    if (target === undefined) return fail("Usage: grant <resource|all> <amount>");
    const parsed = parseNumber(args[1], "amount", { min: 0, max: MAX_RESOURCE_AMOUNT });
    if (!parsed.ok) return fail(parsed.message);

    if (target === "all") {
      for (const key of RESOURCE_KEYS) {
        state.resources[key] += parsed.value;
      }
      appendLog(state, `Admin granted all resources +${fmt(parsed.value)}.`, "system");
      return ok(`Granted ${fmt(parsed.value)} to all resources.`, { changed: true });
    }

    if (!isResourceKey(target)) {
      return fail(`Unknown resource "${target}". Use: ${RESOURCE_KEYS.join(", ")}.`);
    }

    state.resources[target] += parsed.value;
    appendLog(state, `Admin granted ${target} +${fmt(parsed.value)}.`, "system");
    return ok(`Granted ${fmt(parsed.value)} ${target}.`, { changed: true });
  }

  if (command === "upgrade") {
    const target = args[0]?.toLowerCase();
    if (target === undefined) return fail("Usage: upgrade <key|all> [level|+amount]");

    if (target === "list") {
      return ok(UPGRADE_KEYS.join(", "));
    }

    if (target === "all") {
      const parsed = parseUpgradeTarget(0, args[1]);
      if (!parsed.ok) return fail(parsed.message);
      const relative = args[1]?.startsWith("+") ?? false;
      for (const key of UPGRADE_KEYS) {
        const next = relative
          ? Math.min(MAX_UPGRADE_LEVEL, state.upgrades[key] + parsed.value)
          : parsed.value;
        state.upgrades[key] = next;
      }
      const message = relative
        ? `Admin incremented all upgrades by ${parsed.value}.`
        : `Admin set all upgrades to ${parsed.value}.`;
      appendLog(state, message, "upgrade");
      return ok(
        relative
          ? `Incremented all upgrades by ${parsed.value}.`
          : `Updated all upgrades to ${parsed.value}.`,
        {
          changed: true,
        }
      );
    }

    if (!isUpgradeKey(target)) {
      return fail(`Unknown upgrade "${target}". Use "upgrade list" for keys.`);
    }

    const parsed = parseUpgradeTarget(state.upgrades[target], args[1]);
    if (!parsed.ok) return fail(parsed.message);
    state.upgrades[target] = parsed.value;
    appendLog(state, `Admin set ${target} upgrade to ${parsed.value}.`, "upgrade");
    return ok(`${target} upgrade is now ${parsed.value}.`, { changed: true });
  }

  if (command === "level") {
    const parsed = parseNumber(args[0], "level", { min: 1, max: 999, integer: true });
    if (!parsed.ok) return fail(parsed.message);
    state.level = parsed.value;
    appendLog(state, `Admin set sector level to ${parsed.value}.`, "system");
    return ok(`Sector level set to ${parsed.value}.`, { changed: true });
  }

  if (command === "xp") {
    const parsed = parseNumber(args[0], "XP", { min: 0, max: MAX_RESOURCE_AMOUNT });
    if (!parsed.ok) return fail(parsed.message);
    state.xp = parsed.value;
    appendLog(state, `Admin set XP to ${fmt(parsed.value)}.`, "system");
    return ok(`XP set to ${fmt(parsed.value)}.`, { changed: true });
  }

  if (command === "event") {
    const target = args[0]?.toLowerCase();
    if (target === undefined) return fail("Usage: event <eventId|list>");
    if (target === "list") {
      return ok(EVENT_DEFS.map((eventDef) => eventDef.id).join(", "));
    }

    const eventDef = EVENT_DEFS.find((def) => def.id === target);
    if (!eventDef) return fail(`Unknown event "${target}". Use "event list" for ids.`);
    activateEvent(state, eventDef);
    return ok(`Triggered event: ${eventDef.label}.`, { changed: true });
  }

  if (command === "spawn") {
    const target = args[0]?.toLowerCase();
    if (target === undefined) return fail("Usage: spawn <enemyKind|list> [count] [wave]");
    if (target === "list") {
      return ok(ENEMY_KINDS.join(", "));
    }
    if (!isEnemyKind(target)) return fail(`Unknown enemy "${target}". Use "spawn list" for kinds.`);

    const countParsed = parseNumber(args[1] ?? "1", "count", { min: 1, max: MAX_SPAWN_COUNT, integer: true });
    if (!countParsed.ok) return fail(countParsed.message);
    const waveParsed = parseNumber(args[2] ?? String(state.level), "wave", {
      min: 0,
      max: MAX_WAVE_POWER,
      integer: true,
    });
    if (!waveParsed.ok) return fail(waveParsed.message);

    for (let i = 0; i < countParsed.value; i += 1) {
      state.enemies.push(
        spawnEnemy(state.rng, state.nextEnemyId++, waveParsed.value, target, state.timers.tick)
      );
      recordEnemyDiscovery(state, target);
    }
    appendLog(
      state,
      `Admin spawned ${countParsed.value} ${target}${countParsed.value === 1 ? "" : "s"}.`,
      target === "corruptor" || target === "blight" || target === "warden" ? "corruption" : "combat"
    );
    return ok(`Spawned ${countParsed.value} ${target}${countParsed.value === 1 ? "" : "s"}.`, {
      changed: true,
    });
  }

  if (command === "heal") {
    const target = args[0]?.toLowerCase() ?? "all";
    if (target === "workers" || target === "all") healWorkers(state);
    if (target === "defense" || target === "all") healDefense(state);
    if (target === "city" || target === "all") healCity(state);
    if (!["workers", "defense", "city", "all"].includes(target)) {
      return fail("Usage: heal <workers|defense|city|all>");
    }
    appendLog(state, `Admin healed ${target}.`, "system");
    return ok(`Healed ${target}.`, { changed: true });
  }

  if (command === "clear") {
    const target = args[0]?.toLowerCase();
    switch (target) {
      case "enemies":
        state.enemies = [];
        for (const node of state.nodes) {
          node.corruptedBy = null;
        }
        appendLog(state, "Admin cleared enemies.", "combat");
        return ok("Cleared enemies.", { changed: true });
      case "events":
        resetActiveEvents(state);
        appendLog(state, "Admin cleared active events.", "event");
        return ok("Cleared active events and reverted timed modifiers.", { changed: true });
      case "projectiles":
        state.projectiles = [];
        appendLog(state, "Admin cleared projectiles.", "combat");
        return ok("Cleared projectiles.", { changed: true });
      case "corruption":
        clearCorruption(state);
        appendLog(state, "Admin cleared corruption state.", "corruption");
        return ok("Cleared node and worker corruption.", { changed: true });
      case "log":
        state.log = [];
        return ok("Cleared activity log.", { changed: true });
      default:
        return fail("Usage: clear <enemies|events|projectiles|corruption|log>");
    }
  }

  if (command === "preset") {
    const preset = args[0]?.toLowerCase();
    if (preset === undefined) return fail("Usage: preset <midgame|lategame|siege>");
    return applyPreset(state, preset);
  }

  return fail(`Unknown command "${command}". Type help for options.`);
}
