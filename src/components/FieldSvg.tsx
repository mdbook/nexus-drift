import {
  memo,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useReducedMotion } from "framer-motion";
import { WORLD_H, WORLD_W } from "@/game/constants";
import { MISSILE_SILO, SCOUT_HP, SENTINEL, SENTINEL_HP } from "@/game/balance";
import { AGENT_STYLE, ENEMY_STYLE, NODE_STYLE } from "@/game/data";
import type { DerivedState, GameState } from "@/game/types";
import { isCloaked } from "@/game/enemyUtils";
import { useLowFxMode } from "@/hooks/useLowFxMode";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { clamp, elapsedTicks } from "@/game/utils";

const SPAWN_FADE_TICKS = 20;
const DEATH_FADE_TICKS = 18;
const DESPAWN_WARN_TICKS = 60; // start fading out temporary nodes this many ticks before despawn

/** 0→1 fade-in alpha based on how long since spawnTick. */
function spawnAlpha(currentTick: number, spawnTick: number): number {
  if (spawnTick === 0) return 1; // initial game load — no fade
  // 3.1.3 audit follow-up: `currentTick` wraps at TICK_WRAP; raw subtract
  // goes negative for a brief window after wrap and would invert the fade.
  return clamp(elapsedTicks(currentTick, spawnTick) / SPAWN_FADE_TICKS, 0, 1);
}

/** 1→0 fade-out alpha for enemies in their death animation. */
function deathAlpha(dyingTicks: number): number {
  return clamp(dyingTicks / DEATH_FADE_TICKS, 0, 1);
}

/** 1→0 fade-out alpha for temporary nodes approaching despawn. */
function despawnAlpha(currentTick: number, spawnTick: number, despawnAt: number): number {
  // 3.1.3 audit follow-up: wrap-safe countdown. Anchor on spawnTick so
  // both sides of the comparison live in the same [0, TICK_WRAP) window.
  const elapsed = elapsedTicks(currentTick, spawnTick);
  const lifespan = elapsedTicks(despawnAt, spawnTick);
  const remaining = lifespan - elapsed;
  if (remaining > DESPAWN_WARN_TICKS) return 1;
  return clamp(remaining / DESPAWN_WARN_TICKS, 0, 1);
}

/**
 * SVG hex polygon points helper. Hoisted to module scope so the allocation
 * doesn't happen per-worker per-render — the per-agent loop runs O(agents)
 * times every tick.
 */
function hexPoints(cx: number, cy: number, r: number): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    out += `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    if (i < 5) out += " ";
  }
  return out;
}

/** Viewport coordinates for anchoring an inspect popover next to the click. */
type Anchor = { x: number; y: number };

type FieldInteractionHandlers = {
  onTouristClick?: () => void;
  onLostDroneClick?: () => void;
  onAnomalyClick?: () => void;
  onProjectileClick?: (projectileId: number) => void;
  /** Corpse (fading-enemy) achievement click — mutually exclusive with the live-enemy inspect below (hp guard). */
  onEnemyClick?: (enemyId: number) => void;
  // 4.0 Phase 2 — node click stays a DIRECT soft nudge (nearest worker retargets).
  onNodeClick?: (nodeId: number) => void;
  // 4.0 Phase 3 — inspect clicks open a popover in App.tsx (one at a time). The
  // enemy popover's "Mark priority" button is what calls suggestDefensePriority;
  // clicking a live enemy no longer marks it directly (Phase 2 behavior removed).
  onEnemyInspect?: (enemyId: number, anchor: Anchor) => void;
  onWorkerInspect?: (agentId: number, anchor: Anchor) => void;
  onCityInspect?: (anchor: Anchor) => void;
};

type FieldSvgProps = {
  game: GameState;
  derived: DerivedState;
  interactions?: FieldInteractionHandlers;
};

const CITY_PALETTE = [
  {
    stroke: "rgba(127, 222, 255, 0.82)",
    fill: "rgba(114, 198, 255, 0.2)",
    accent: "rgba(220, 248, 255, 0.92)",
  },
  {
    stroke: "rgba(153, 238, 255, 0.82)",
    fill: "rgba(121, 222, 255, 0.22)",
    accent: "rgba(228, 252, 255, 0.94)",
  },
  {
    stroke: "rgba(99, 204, 255, 0.82)",
    fill: "rgba(80, 170, 245, 0.22)",
    accent: "rgba(197, 237, 255, 0.92)",
  },
  {
    stroke: "rgba(140, 255, 204, 0.8)",
    fill: "rgba(90, 226, 185, 0.22)",
    accent: "rgba(220, 255, 240, 0.94)",
  },
  {
    stroke: "rgba(105, 212, 255, 0.82)",
    fill: "rgba(80, 188, 255, 0.2)",
    accent: "rgba(210, 245, 255, 0.92)",
  },
  {
    stroke: "rgba(152, 235, 255, 0.8)",
    fill: "rgba(118, 215, 255, 0.22)",
    accent: "rgba(226, 249, 255, 0.94)",
  },
  {
    stroke: "rgba(151, 255, 195, 0.8)",
    fill: "rgba(114, 232, 165, 0.22)",
    accent: "rgba(224, 255, 234, 0.94)",
  },
  {
    stroke: "rgba(102, 220, 255, 0.82)",
    fill: "rgba(84, 194, 245, 0.22)",
    accent: "rgba(206, 242, 255, 0.92)",
  },
  {
    stroke: "rgba(170, 246, 255, 0.82)",
    fill: "rgba(138, 226, 255, 0.22)",
    accent: "rgba(232, 251, 255, 0.94)",
  },
  {
    stroke: "rgba(130, 255, 212, 0.8)",
    fill: "rgba(102, 228, 190, 0.22)",
    accent: "rgba(225, 255, 241, 0.92)",
  },
  {
    stroke: "rgba(110, 208, 255, 0.82)",
    fill: "rgba(76, 182, 245, 0.22)",
    accent: "rgba(205, 240, 255, 0.92)",
  },
  {
    stroke: "rgba(191, 247, 255, 0.84)",
    fill: "rgba(146, 229, 255, 0.22)",
    accent: "rgba(239, 252, 255, 0.95)",
  },
  {
    stroke: "rgba(144, 255, 198, 0.82)",
    fill: "rgba(100, 232, 176, 0.22)",
    accent: "rgba(228, 255, 238, 0.94)",
  },
  {
    stroke: "rgba(255, 213, 143, 0.8)",
    fill: "rgba(248, 186, 108, 0.2)",
    accent: "rgba(255, 244, 214, 0.94)",
  },
  {
    stroke: "rgba(255, 189, 174, 0.78)",
    fill: "rgba(246, 155, 138, 0.2)",
    accent: "rgba(255, 236, 230, 0.94)",
  },
  {
    stroke: "rgba(255, 168, 211, 0.76)",
    fill: "rgba(240, 130, 183, 0.18)",
    accent: "rgba(255, 230, 244, 0.92)",
  },
  {
    stroke: "rgba(215, 176, 255, 0.8)",
    fill: "rgba(176, 130, 242, 0.2)",
    accent: "rgba(241, 228, 255, 0.94)",
  },
  {
    stroke: "rgba(178, 190, 255, 0.8)",
    fill: "rgba(136, 146, 242, 0.2)",
    accent: "rgba(229, 233, 255, 0.94)",
  },
  {
    stroke: "rgba(177, 255, 233, 0.8)",
    fill: "rgba(126, 232, 215, 0.2)",
    accent: "rgba(232, 255, 247, 0.94)",
  },
  {
    stroke: "rgba(245, 228, 176, 0.78)",
    fill: "rgba(220, 197, 122, 0.2)",
    accent: "rgba(255, 249, 226, 0.94)",
  },
];

type DistrictBuilding = {
  x: number;
  width: number;
  baseHeight: number;
  unlockStage: number;
  paletteIndex: number;
  bodyStyle: number;
  crownHeight: number;
  crownWidth: number;
  sidecarWidth: number;
  inset: number;
  beaconCount: number;
  windowColumns: number;
  bridge: boolean;
  turretIndex: number;
};

type DistrictRenderData = {
  progress: number;
  stage: number;
  buildProgress: number;
  chromatic: boolean;
  districtOpacity: number;
  activeTurretXs: number[];
  activeBuildings: DistrictBuilding[];
  sequentialCursor: number;
  fullyBuiltCount: number;
  activeBuildIndex: number;
  districtSpines: number;
  activePalette: typeof CITY_PALETTE;
};

const CITY_MAX_STAGE = 5;

function seededNoise(seed: number, salt: number) {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453123;
  return value - Math.floor(value);
}

function buildDistrict(seed: number, turretXs: number[]) {
  const buildings: DistrictBuilding[] = [];
  let index = 0;

  turretXs.forEach((turretX, turretIndex) => {
    const clusterCount = 4 + Math.floor(seededNoise(seed, 20 + turretIndex) * 3);
    const exclusionRadius = 42 + seededNoise(seed, 55 + turretIndex) * 12;
    const rawSpecs = Array.from({ length: clusterCount }, (_, localIndex) => {
      const width = 13 + Math.floor(seededNoise(seed, index + localIndex + 2) * 24);
      const gap = 8 + Math.floor(seededNoise(seed, index + localIndex + 30) * 14);
      const heightBias = localIndex / Math.max(1, clusterCount - 1);
      return {
        width,
        gap,
        baseHeight: 24 + Math.round(seededNoise(seed, index + localIndex + 60) * 30 + heightBias * 48),
        unlockStage: Math.min(
          CITY_MAX_STAGE,
          Math.max(
            1,
            Math.floor(seededNoise(seed, index + localIndex + 90) * CITY_MAX_STAGE) +
              1 -
              Math.floor(heightBias)
          )
        ),
      };
    });

    const leftSpecs = rawSpecs.slice(0, Math.ceil(clusterCount / 2));
    const rightSpecs = rawSpecs.slice(Math.ceil(clusterCount / 2));
    const leftSpan = leftSpecs.reduce(
      (sum, spec, localIndex) => sum + spec.width + (localIndex < leftSpecs.length - 1 ? spec.gap : 0),
      0
    );

    let leftCursor = turretX - exclusionRadius - leftSpan;
    leftSpecs.forEach((spec, localIndex) => {
      const jitter = (seededNoise(seed, index + 15) - 0.5) * 8;
      buildings.push({
        x: leftCursor + jitter,
        width: spec.width,
        baseHeight: spec.baseHeight,
        unlockStage: spec.unlockStage,
        paletteIndex: Math.floor(seededNoise(seed, index + 120) * CITY_PALETTE.length),
        bodyStyle: Math.floor(seededNoise(seed, index + 150) * 4),
        crownHeight: 4 + Math.floor(seededNoise(seed, index + 180) * 18),
        crownWidth: 0.3 + seededNoise(seed, index + 210) * 0.5,
        sidecarWidth:
          seededNoise(seed, index + 240) > 0.56 ? 4 + Math.floor(seededNoise(seed, index + 241) * 9) : 0,
        inset: 2 + Math.floor(seededNoise(seed, index + 270) * 5),
        beaconCount: 1 + Math.floor(seededNoise(seed, index + 300) * 3),
        windowColumns: 1 + Math.floor(seededNoise(seed, index + 330) * 3),
        bridge: localIndex < leftSpecs.length - 1 && seededNoise(seed, index + 360) > 0.66,
        turretIndex,
      });
      leftCursor += spec.width + spec.gap;
      index += 1;
    });

    let rightCursor = turretX + exclusionRadius;
    rightSpecs.forEach((spec, localIndex) => {
      const jitter = (seededNoise(seed, index + 15) - 0.5) * 8;
      buildings.push({
        x: rightCursor + jitter,
        width: spec.width,
        baseHeight: spec.baseHeight,
        unlockStage: spec.unlockStage,
        paletteIndex: Math.floor(seededNoise(seed, index + 120) * CITY_PALETTE.length),
        bodyStyle: Math.floor(seededNoise(seed, index + 150) * 4),
        crownHeight: 4 + Math.floor(seededNoise(seed, index + 180) * 18),
        crownWidth: 0.3 + seededNoise(seed, index + 210) * 0.5,
        sidecarWidth:
          seededNoise(seed, index + 240) > 0.56 ? 4 + Math.floor(seededNoise(seed, index + 241) * 9) : 0,
        inset: 2 + Math.floor(seededNoise(seed, index + 270) * 5),
        beaconCount: 1 + Math.floor(seededNoise(seed, index + 300) * 3),
        windowColumns: 1 + Math.floor(seededNoise(seed, index + 330) * 3),
        bridge: localIndex < rightSpecs.length - 1 && seededNoise(seed, index + 360) > 0.66,
        turretIndex,
      });
      rightCursor += spec.width + spec.gap;
      index += 1;
    });
  });

  return buildings.sort((a, b) => a.x - b.x);
}

function renderHomeDistrict(
  game: GameState,
  district: DistrictRenderData | null,
  dayFactor: number,
  paletteDrift: number
) {
  if (!district) return null;

  const {
    progress,
    stage,
    buildProgress,
    chromatic,
    districtOpacity,
    activeTurretXs,
    activeBuildings,
    sequentialCursor,
    fullyBuiltCount,
    activeBuildIndex,
    districtSpines,
    activePalette,
  } = district;
  const towerScale = 0.76 + stage * 0.08;

  return (
    <g>
      {activeTurretXs.map((turretX, index) => (
        <g key={`district-zone-${turretX}`}>
          <ellipse
            cx={turretX}
            cy="552"
            rx={78 + index * 6}
            ry="20"
            fill="rgba(105, 210, 255, 0.06)"
            stroke="rgba(150, 235, 255, 0.14)"
            strokeWidth="1"
          />
          <path
            d={`M ${turretX - 88} 558 C ${turretX - 36} 538, ${turretX + 34} 538, ${turretX + 88} 558`}
            fill="none"
            stroke="rgba(130, 220, 255, 0.14)"
            strokeWidth="1.1"
            strokeDasharray="4 7"
          />
        </g>
      ))}

      <path
        d="M130 555 L170 538 L220 548 L290 520 L352 532 L426 505 L500 520 L572 486 L635 498 L708 466 L790 494 L858 478 L888 495"
        fill="none"
        stroke={`rgba(120,220,255,${(0.08 + stage * 0.022).toFixed(2)})`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M122 566 L164 549 L222 558 L286 530 L352 542 L430 515 L500 530 L572 497 L634 508 L708 477 L790 505 L858 488 L894 504"
        fill="none"
        stroke={`rgba(170,255,215,${(0.06 + stage * 0.018).toFixed(2)})`}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {Array.from({ length: districtSpines }, (_, index) => {
        const lane = activeTurretXs[index % activeTurretXs.length] ?? 500;
        const rawOffset = (seededNoise(game.citySeed, 420 + index) - 0.5) * 110;
        const laneOffset = Math.abs(rawOffset) < 42 ? (rawOffset < 0 ? -42 : 42) : rawOffset;
        const x = lane + laneOffset;
        const towerHeight =
          (20 + seededNoise(game.citySeed, 450 + index) * 18 + index * 4 + progress * 10) * towerScale;
        const y = 548 - towerHeight;
        const palette =
          activePalette[
            chromatic
              ? Math.floor((index * 1.7 + paletteDrift + index * 0.6) % activePalette.length)
              : index % activePalette.length
          ];
        return (
          <g key={`spire-${index}`} opacity={districtOpacity * 0.72}>
            <line
              x1={x}
              y1="552"
              x2={x}
              y2={y + 8}
              stroke={palette.stroke}
              strokeWidth="1.5"
              opacity={0.45}
            />
            <circle cx={x} cy={y} r={3 + (index % 2)} fill={palette.accent} />
            <circle cx={x} cy={y} r={9 + (index % 3) * 2} fill={palette.fill} />
          </g>
        );
      })}

      {activeBuildings.map((building, index) => {
        const buildingProgress =
          buildProgress >= 1
            ? 1
            : index < fullyBuiltCount
              ? 1
              : index === activeBuildIndex
                ? clamp(sequentialCursor - fullyBuiltCount, 0, 1)
                : 0;
        if (buildingProgress <= 0.001) return null;

        const revealProgress = clamp(buildingProgress, 0, 1);
        const grownHeightFactor = 0.08 + revealProgress * 0.92;
        const height = building.baseHeight * grownHeightFactor;
        const y = 552 - height;
        const lightRows = Math.max(1, Math.floor(height / 11));
        const palette =
          activePalette[
            chromatic
              ? Math.floor((building.paletteIndex + paletteDrift + index * 0.85) % activePalette.length)
              : building.paletteIndex % activePalette.length
          ];
        const insetWidth = Math.max(6, building.width - building.inset * 2);
        const crownWidth = Math.max(6, building.width * building.crownWidth);
        const crownX = building.x + (building.width - crownWidth) / 2;
        const crownY = y - building.crownHeight * revealProgress;
        const sidecarX = building.sidecarWidth > 0 ? building.x - building.sidecarWidth + 2 : building.x;
        const bodyGlow = (building.bodyStyle === 3 ? 0.22 : 0.12) * (0.35 + revealProgress * 0.65);
        return (
          <g key={`building-${building.x}`}>
            <rect
              x={building.x - 3}
              y={y - 6}
              width={building.width + 6}
              height={height + 10}
              rx="6"
              fill={palette.fill}
              opacity={bodyGlow}
            />
            <rect
              x={building.x}
              y={y}
              width={building.width}
              height={height}
              rx="4"
              fill="rgba(18,34,56,0.74)"
              stroke={palette.stroke}
              strokeWidth="1"
              opacity={districtOpacity * (0.38 + revealProgress * 0.62)}
            />
            <rect
              x={building.x + building.inset}
              y={y + 2}
              width={insetWidth}
              height={Math.max(4, height * 0.22)}
              rx="3"
              fill={palette.fill}
              opacity={0.28 + revealProgress * 0.37}
            />
            {building.bodyStyle >= 1 && revealProgress >= 0.35 && (
              <rect
                x={building.x + 3}
                y={y + Math.max(8, height * 0.3)}
                width={Math.max(5, building.width - 6)}
                height={Math.max(5, height * 0.12)}
                rx="2"
                fill="rgba(255,255,255,0.04)"
                stroke={palette.stroke}
                strokeWidth="0.8"
                opacity={0.55}
              />
            )}
            {building.bodyStyle >= 2 && revealProgress >= 0.55 && (
              <rect
                x={crownX}
                y={crownY}
                width={crownWidth}
                height={building.crownHeight * revealProgress}
                rx="3"
                fill="rgba(20,40,62,0.86)"
                stroke={palette.accent}
                strokeWidth="0.9"
                opacity={0.8}
              />
            )}
            {building.bodyStyle === 3 && building.sidecarWidth > 0 && revealProgress >= 0.68 && (
              <rect
                x={sidecarX}
                y={y + Math.max(10, height * 0.22)}
                width={building.sidecarWidth}
                height={Math.max(12, height * 0.44)}
                rx="3"
                fill="rgba(16,30,48,0.74)"
                stroke={palette.stroke}
                strokeWidth="0.9"
                opacity={0.78}
              />
            )}
            {Array.from({ length: Math.max(1, Math.floor(lightRows * revealProgress)) }, (_, lightIndex) => (
              <g key={`window-${index}-${lightIndex}`}>
                {Array.from({ length: building.windowColumns }, (_, columnIndex) => {
                  const gutter = (building.width - 8) / building.windowColumns;
                  const windowWidth = Math.max(2.2, gutter - 3);
                  const wx = building.x + 4 + columnIndex * gutter;
                  const wy = y + 8 + lightIndex * 10;
                  return (
                    <rect
                      key={`window-${index}-${lightIndex}-${columnIndex}`}
                      x={wx}
                      y={wy}
                      width={windowWidth}
                      height="2"
                      rx="1"
                      fill={lightIndex % 2 === 0 ? palette.accent : palette.stroke}
                      opacity={
                        (0.4 + ((columnIndex + lightIndex) % 3) * 0.08) *
                        revealProgress *
                        (0.15 + dayFactor * 0.85)
                      }
                    />
                  );
                })}
              </g>
            ))}
            {building.width >= 18 && revealProgress >= 0.6 && (
              <line
                x1={building.x + building.width / 2}
                y1={crownY + (building.bodyStyle >= 2 ? 0 : building.crownHeight)}
                x2={building.x + building.width / 2}
                y2={crownY - 8 - building.unlockStage * 2}
                stroke={palette.accent}
                strokeWidth="1"
                opacity={0.6}
              />
            )}
            {Array.from({ length: revealProgress >= 0.78 ? building.beaconCount : 0 }, (_, beaconIndex) => {
              const bx =
                building.x + 4 + ((building.width - 8) * beaconIndex) / Math.max(1, building.beaconCount - 1);
              const by = crownY - 6 - beaconIndex * 2;
              return (
                <circle
                  key={`beacon-${index}-${beaconIndex}`}
                  cx={bx}
                  cy={by}
                  r="1.3"
                  fill={palette.accent}
                  opacity={0.88}
                />
              );
            })}
          </g>
        );
      })}

      {stage >= 2 && (
        <g opacity={0.48 + progress * 0.16}>
          <path
            d="M252 552 C320 542, 390 532, 458 520 S602 504, 742 490"
            fill="none"
            stroke="rgba(110,215,255,0.4)"
            strokeWidth="2"
            strokeDasharray="6 7"
          />
          <path
            d="M246 560 C318 550, 386 541, 460 528 S603 512, 748 500"
            fill="none"
            stroke="rgba(154,255,210,0.28)"
            strokeWidth="1.4"
            strokeDasharray="4 8"
          />
        </g>
      )}

      {activeBuildings.map((building, index) => {
        const buildingProgress =
          buildProgress >= 1
            ? 1
            : index < fullyBuiltCount
              ? 1
              : index === activeBuildIndex
                ? clamp(sequentialCursor - fullyBuiltCount, 0, 1)
                : 0;
        if (!building.bridge || buildingProgress < 1 || index === activeBuildings.length - 1) return null;
        const nextBuilding = activeBuildings[index + 1];
        const nextProgress =
          buildProgress >= 1
            ? 1
            : index + 1 < fullyBuiltCount
              ? 1
              : index + 1 === activeBuildIndex
                ? clamp(sequentialCursor - fullyBuiltCount, 0, 1)
                : 0;
        if (nextProgress < 1) return null;
        const startY = 552 - building.baseHeight * 0.46;
        const endY = 552 - nextBuilding.baseHeight * 0.42;
        if (building.turretIndex !== nextBuilding.turretIndex) return null;
        return (
          <path
            key={`bridge-${building.x}`}
            d={`M ${building.x + building.width - 2} ${startY} C ${building.x + building.width + 10} ${startY - 6}, ${nextBuilding.x - 10} ${endY - 6}, ${nextBuilding.x + 2} ${endY}`}
            fill="none"
            stroke="rgba(165,235,255,0.24)"
            strokeWidth="1"
            strokeDasharray="3 4"
            opacity="0.75"
          />
        );
      })}

      {stage >= 4 && (
        <g opacity={0.68}>
          <path
            d="M686 458 L700 438 L714 458 Z"
            fill="rgba(180,248,255,0.8)"
            stroke="rgba(220,250,255,0.9)"
            strokeWidth="1"
          />
          <circle cx="700" cy="430" r="5" fill="rgba(214,255,225,0.92)" />
          <circle cx="700" cy="430" r="16" fill="rgba(120,220,255,0.12)" />
        </g>
      )}
    </g>
  );
}

function FieldSvgInner({ game, derived, interactions }: FieldSvgProps) {
  const lowFxMode = useLowFxMode();
  // Touch-target sizing: enlarge invisible field hit-halos to the ~44px touch
  // minimum on coarse pointers (iPad/phone). Desktop keeps precise small halos.
  const coarsePointer = useCoarsePointer();
  // Reduced-motion users should not get continuous field motion (node pulses,
  // worker bob, corruption shake). Fold prefers-reduced-motion into the existing
  // low-FX continuous-effect gate so the low-FX static fallbacks apply to them
  // too; iPad (already low-FX) behaviour is unchanged since reduceFx is a superset.
  const prefersReducedMotion = useReducedMotion();
  const reduceFx = lowFxMode || prefersReducedMotion;
  const activeTurretXs = useMemo(
    () => game.turrets.slice(0, derived.activeTurrets).map((turret) => turret.x),
    [game.turrets, derived.activeTurrets]
  );
  const districtBuildings = useMemo(
    () => buildDistrict(game.citySeed, activeTurretXs),
    [activeTurretXs, game.citySeed]
  );
  const district = useMemo<DistrictRenderData | null>(() => {
    if (derived.cityStage === 0 || districtBuildings.length === 0) return null;

    const progress = clamp(derived.cityProgress, 0, 1);
    const stage = derived.cityStage;
    const buildProgress = clamp(derived.cityBuildProgress, 0, 1);
    const chromatic = stage >= 5 && buildProgress >= 1;
    const sequentialCursor = buildProgress * districtBuildings.length;
    const fullyBuiltCount = Math.floor(sequentialCursor);
    const activeBuildIndex = Math.min(districtBuildings.length - 1, fullyBuiltCount);

    return {
      progress,
      stage,
      buildProgress,
      chromatic,
      districtOpacity: 0.36 + stage * 0.1,
      activeTurretXs,
      activeBuildings: districtBuildings.filter((_, index) => index <= activeBuildIndex),
      sequentialCursor,
      fullyBuiltCount,
      activeBuildIndex,
      districtSpines: Math.min(
        9,
        activeTurretXs.length * 2 + stage + Math.floor(seededNoise(game.citySeed, 400) * 2)
      ),
      activePalette: chromatic ? CITY_PALETTE.slice(0, 20) : CITY_PALETTE.slice(0, 12),
    };
    // 3.1.0 — game.timers.tick was previously in the dep list for paletteDrift,
    // which caused this memo to recompute every tick even though only the
    // palette-shift animation (stage 5+) cared about it. paletteDrift is now
    // computed outside the memo and threaded through renderHomeDistrict.
  }, [
    activeTurretXs,
    derived.cityBuildProgress,
    derived.cityProgress,
    derived.cityStage,
    districtBuildings,
    game.citySeed,
  ]);
  const paletteDrift = district?.chromatic ? game.timers.tick * 0.0045 : 0;
  const dayCycleMs = 30 * 60 * 1000;
  const dayPhase = (game.stats.runtimeMs % dayCycleMs) / dayCycleMs;
  const dayFactor = Math.sin(dayPhase * Math.PI * 2) * 0.5 + 0.5;
  const skyLight = Math.round(dayFactor * 18);
  const skyColor = `rgb(${skyLight}, ${skyLight + 4}, ${skyLight + 10})`;
  const nightOverlayOpacity = dayFactor < 0.5 ? 1 - dayFactor * 2 : 0;
  const touristInteractive = Boolean(interactions?.onTouristClick) && Boolean(game.touristWorker?.active);
  const lostDroneInteractive = Boolean(interactions?.onLostDroneClick) && Boolean(game.lostDrone);
  const anomalyInteractive =
    Boolean(interactions?.onAnomalyClick) && game.activeEvents.length >= 3 && !game.achievements.event_streak;
  const nodeInteractive = Boolean(interactions?.onNodeClick);
  const enemyInspectInteractive = Boolean(interactions?.onEnemyInspect);
  const workerInspectInteractive = Boolean(interactions?.onWorkerInspect);
  // Phase 3: clicking the city core opens the read-only inspect popover.
  const cityInteractive = Boolean(interactions?.onCityInspect);

  // 4.0 — brief click-acknowledge pulse ring on the last-clicked target. Purely
  // presentation-only and tick-driven (no timers), consistent with the rest of
  // the field FX; simplifies under useLowFxMode rather than disappearing.
  const [clickPulse, setClickPulse] = useState<{ x: number; y: number; startTick: number } | null>(null);
  const pulseAt = (x: number, y: number) => setClickPulse({ x, y, startTick: game.timers.tick });

  // Viewport anchor for inspect popovers: a mouse click carries clientX/Y; a
  // keyboard activation (Enter/Space) has none, so fall back to the target's
  // on-screen center.
  const inspectAnchor = (event: ReactMouseEvent<SVGElement> | ReactKeyboardEvent<SVGElement>): Anchor => {
    if ("key" in event) {
      const rect = (event.currentTarget as Element).getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return { x: event.clientX, y: event.clientY };
  };

  const onSvgActivate = (event: ReactKeyboardEvent<SVGElement>, handler?: () => void) => {
    if (!handler) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    handler();
  };

  return (
    <svg
      viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
      className="h-full min-h-[380px] w-full touch-manipulation select-none bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] lg:min-h-0"
    >
      <defs>
        <radialGradient id="fieldGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.6)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <linearGradient id="groundGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.02)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.08)" />
        </linearGradient>
        {!lowFxMode && (
          <filter id="textBlur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" />
          </filter>
        )}
      </defs>

      <rect width={WORLD_W} height={WORLD_H} fill={skyColor} />

      <path
        d="M0 485 C170 430, 300 540, 420 505 S690 420, 795 468 S940 525, 1000 462 L1000 620 L0 620 Z"
        fill="url(#groundGradient)"
      />
      <path
        d="M0 540 C180 500, 330 575, 470 540 S760 495, 1000 560"
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="2"
      />

      <rect
        x="105"
        y="498"
        width="790"
        height="82"
        rx="24"
        fill="rgba(255,255,255,0.03)"
        stroke="rgba(185,232,255,0.22)"
        strokeWidth="1.4"
      />
      <rect
        x="113"
        y="506"
        width="774"
        height="66"
        rx="18"
        fill="none"
        stroke="rgba(120,215,255,0.14)"
        strokeWidth="1"
        strokeDasharray="8 8"
      />

      <path d="M118 538 H882" fill="none" stroke="rgba(120, 215, 255, 0.12)" strokeWidth="1" />

      {nightOverlayOpacity > 0 && (
        <rect
          width={WORLD_W}
          height={WORLD_H}
          fill="rgba(15, 20, 60, 0.4)"
          opacity={nightOverlayOpacity}
          style={{ pointerEvents: "none" }}
        />
      )}

      {renderHomeDistrict(game, district, dayFactor, paletteDrift)}

      {(() => {
        // 3.0.0: city damage overlay + HP bar. A soft red wash layers over the
        // home district while damageTicks is ticking down; a slim HP bar along
        // the top of the home band appears whenever HP is below max.
        const cityIntegrity = game.city.maxHp > 0 ? clamp(game.city.hp / game.city.maxHp, 0, 1) : 1;
        const showCityBar = cityIntegrity < 1 - 1e-3;
        const cityFlash = game.city.damageTicks > 0 ? Math.min(0.45, (game.city.damageTicks / 30) * 0.45) : 0;
        const barWidth = 140;
        const barX = WORLD_W / 2 - barWidth / 2;
        const barY = 512;
        const cityClick = (event: ReactMouseEvent<SVGElement> | ReactKeyboardEvent<SVGElement>) => {
          interactions?.onCityInspect?.(inspectAnchor(event));
          pulseAt(WORLD_W / 2, 540);
        };
        return (
          <g>
            {cityFlash > 0 && (
              <rect
                x={0}
                y={500}
                width={WORLD_W}
                height={WORLD_H - 500}
                fill={`rgba(255,80,80,${cityFlash.toFixed(2)})`}
                style={{ pointerEvents: "none" }}
              />
            )}
            {cityInteractive && (
              // Phase 3 city click: opens the read-only inspect popover.
              // Transparent hit-band over the home core.
              <rect
                x={WORLD_W / 2 - 120}
                y={500}
                width={240}
                height={WORLD_H - 500}
                fill="rgba(0,0,0,0.001)"
                role="button"
                tabIndex={0}
                aria-label="Inspect the home district"
                onClick={cityClick}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  cityClick(event);
                }}
                style={{ cursor: "pointer" }}
              />
            )}
            {showCityBar && (
              <>
                <rect x={barX} y={barY} rx="3" ry="3" width={barWidth} height="4" fill="rgba(0,0,0,0.5)" />
                <rect
                  x={barX}
                  y={barY}
                  rx="3"
                  ry="3"
                  width={barWidth * cityIntegrity}
                  height="4"
                  fill={cityIntegrity < 0.35 ? "rgba(255,120,100,0.92)" : "rgba(160,220,255,0.82)"}
                />
              </>
            )}
          </g>
        );
      })()}

      {game.scouts.map((scout, index) => {
        const live = index < derived.activeScouts;
        return (
          <g key={`pad-${scout.id}`}>
            <circle
              cx={scout.homeX}
              cy={scout.homeY + 12}
              r="18"
              fill={live ? "rgba(208,168,255,0.12)" : "rgba(255,255,255,0.04)"}
              stroke={live ? "rgba(235,210,255,0.35)" : "rgba(255,255,255,0.08)"}
            />
          </g>
        );
      })}

      {game.turrets.map((turret, index) => {
        const live = index < derived.activeTurrets;
        if (!live) {
          return (
            <g key={turret.id}>
              <circle cx={turret.x} cy={turret.y} r="16" fill="rgba(255,255,255,0.05)" />
              <circle
                cx={turret.x}
                cy={turret.y}
                r="6"
                fill="rgba(255,255,255,0.08)"
                stroke="rgba(255,255,255,0.15)"
              />
            </g>
          );
        }

        const turretDisabled = turret.disabledTicks > 0;
        const turretBroken = turret.brokenTicks > 0;
        const disablePulse = 0.3 + Math.sin(game.timers.tick / 5) * 0.2;
        // 3.0.0: damageTicks drives a brief red flash after any structural
        // hit; brokenTicks drives the longer cracked-sprite downtime.
        const damageFlash =
          !turretBroken && turret.damageTicks > 0 ? Math.min(0.85, turret.damageTicks / 12) : 0;
        const hpPct = turret.maxHp > 0 ? clamp(turret.hp / turret.maxHp, 0, 1) : 1;
        const showHpBar = !turretBroken && hpPct < 1 - 1e-3;
        const groupFilter = turretBroken
          ? "grayscale(1) brightness(0.55)"
          : turretDisabled
            ? "grayscale(1)"
            : undefined;
        return (
          <g key={turret.id} style={groupFilter ? { filter: groupFilter } : undefined}>
            {!turretBroken && (
              <circle
                cx={turret.x}
                cy={turret.y}
                r={turret.range}
                fill="none"
                stroke="rgba(80,200,255,0.07)"
                strokeDasharray="7 9"
              />
            )}
            {turretDisabled && !turretBroken && (
              <circle
                cx={turret.x}
                cy={turret.y}
                r="26"
                fill="none"
                stroke={`rgba(255,120,40,${disablePulse.toFixed(2)})`}
                strokeWidth="2.5"
              />
            )}
            {damageFlash > 0 && (
              <circle cx={turret.x} cy={turret.y} r="24" fill={`rgba(255,80,80,${damageFlash.toFixed(2)})`} />
            )}
            <circle
              cx={turret.x}
              cy={turret.y}
              r="22"
              fill={turretBroken ? "rgba(90,40,40,0.28)" : "rgba(80,200,255,0.10)"}
            />
            <circle
              cx={turret.x}
              cy={turret.y}
              r="14"
              fill={turretBroken ? "rgba(60,40,50,0.72)" : "rgba(40,120,200,0.55)"}
              stroke={turretBroken ? "rgba(220,90,90,0.7)" : "rgba(120,220,255,0.75)"}
              strokeWidth="2"
            />
            <line
              x1={turret.x}
              y1={turret.y}
              x2={turret.x + Math.cos(turret.angle) * 21}
              y2={turret.y + Math.sin(turret.angle) * 21}
              stroke={turretBroken ? "rgba(180,80,80,0.6)" : "rgba(160,235,255,0.95)"}
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            {turretBroken && !lowFxMode && (
              <>
                <line
                  x1={turret.x - 10}
                  y1={turret.y - 8}
                  x2={turret.x + 6}
                  y2={turret.y + 4}
                  stroke="rgba(255,160,160,0.75)"
                  strokeWidth="1.3"
                />
                <line
                  x1={turret.x - 3}
                  y1={turret.y + 9}
                  x2={turret.x + 11}
                  y2={turret.y - 4}
                  stroke="rgba(255,200,200,0.55)"
                  strokeWidth="1.1"
                />
              </>
            )}
            {showHpBar && (
              <>
                <rect
                  x={turret.x - 16}
                  y={turret.y + 26}
                  rx="2"
                  ry="2"
                  width="32"
                  height="3"
                  fill="rgba(0,0,0,0.45)"
                />
                <rect
                  x={turret.x - 16}
                  y={turret.y + 26}
                  rx="2"
                  ry="2"
                  width={32 * hpPct}
                  height="3"
                  fill={hpPct < 0.3 ? "rgba(255,120,120,0.9)" : "rgba(160,235,255,0.85)"}
                />
              </>
            )}
          </g>
        );
      })}

      {/* 3.0.0 Step 5 — missile silo pylons */}
      {game.missileSilos.map((silo) => {
        const siloAlpha = silo.active ? 1 : 0.22;
        const cooldownRatio = silo.active
          ? Math.max(0, 1 - silo.cooldown / MISSILE_SILO.fireIntervalTicks)
          : 0;
        // Charge-up pulse: ring brightens as the shot approaches ready.
        const chargePulse = silo.active && silo.cooldown <= 60 ? 0.35 + (1 - silo.cooldown / 60) * 0.55 : 0;
        // Brief flash after launch: cooldown resets to fireIntervalTicks,
        // so a very high cooldown means a shot just left.
        const launchFlash =
          silo.active && silo.cooldown > MISSILE_SILO.fireIntervalTicks - 8
            ? (MISSILE_SILO.fireIntervalTicks - (MISSILE_SILO.fireIntervalTicks - silo.cooldown)) / 8
            : 0;
        return (
          <g key={silo.id} opacity={siloAlpha}>
            {/* Range ring — only when active. 3.1.3: silo range now scales
                with missileLauncher upgrade level, so compute it inline rather
                than rendering the static base. */}
            {silo.active && (
              <circle
                cx={silo.x}
                cy={silo.y}
                r={MISSILE_SILO.rangeBase + game.upgrades.missileLauncher * MISSILE_SILO.rangePerLevel}
                fill="none"
                stroke="rgba(255,100,0,0.04)"
                strokeDasharray="12 16"
              />
            )}
            {/* Launch flash overlay */}
            {launchFlash > 0 && (
              <circle cx={silo.x} cy={silo.y} r="20" fill={`rgba(255,140,30,${launchFlash.toFixed(2)})`} />
            )}
            {/* Charge ring */}
            {chargePulse > 0 && !lowFxMode && (
              <circle
                cx={silo.x}
                cy={silo.y}
                r="18"
                fill="none"
                stroke={`rgba(255,120,20,${chargePulse.toFixed(2)})`}
                strokeWidth="2"
              />
            )}
            {/* Pylon body */}
            <rect
              x={silo.x - 6}
              y={silo.y - 20}
              width="12"
              height="22"
              rx="2"
              ry="2"
              fill={silo.active ? "rgba(200,80,20,0.75)" : "rgba(100,60,40,0.40)"}
              stroke={silo.active ? "rgba(255,160,60,0.80)" : "rgba(160,100,60,0.40)"}
              strokeWidth="1.5"
            />
            {/* Barrel pointing at angle */}
            <line
              x1={silo.x}
              y1={silo.y - 12}
              x2={silo.x + Math.cos(silo.angle) * 18}
              y2={silo.y - 12 + Math.sin(silo.angle) * 18}
              stroke={silo.active ? "rgba(255,180,80,0.95)" : "rgba(160,100,60,0.40)"}
              strokeWidth="3"
              strokeLinecap="round"
            />
            {/* Cooldown / charge bar below */}
            {silo.active && (
              <>
                <rect
                  x={silo.x - 8}
                  y={silo.y + 4}
                  rx="1"
                  ry="1"
                  width="16"
                  height="2"
                  fill="rgba(0,0,0,0.45)"
                />
                <rect
                  x={silo.x - 8}
                  y={silo.y + 4}
                  rx="1"
                  ry="1"
                  width={16 * cooldownRatio}
                  height="2"
                  fill={cooldownRatio > 0.9 ? "rgba(255,200,60,0.95)" : "rgba(255,110,20,0.80)"}
                />
              </>
            )}
          </g>
        );
      })}

      {game.nodes.map((node) => {
        const style = NODE_STYLE[node.kind];
        const hpPct = clamp((node.hp / node.maxHp) * 100, 0, 100);
        const minedPct = clamp(1 - node.hp / node.maxHp, 0, 1);
        const recentWorkAlpha = clamp(node.workTicks / 120, 0, 1);
        const hpBarX = node.x - 22;
        const hpBarY = node.y + node.size + 10;
        const hpBarWidth = 44;
        const hpWidth = (hpBarWidth * hpPct) / 100;
        const minedWidth = hpBarWidth * minedPct;
        const showRecentWork = minedWidth > 1.5 && recentWorkAlpha > 0.02;
        const corruptionPct = clamp(node.corruption, 0, 100);
        const toxicGlow = node.corruption > 0 ? 0.1 + node.corruption / 200 : 0;
        const nodeAlpha =
          node.temporary && node.despawnAt !== undefined
            ? Math.min(
                spawnAlpha(game.timers.tick, node.spawnTick),
                despawnAlpha(game.timers.tick, node.spawnTick, node.despawnAt)
              )
            : spawnAlpha(game.timers.tick, node.spawnTick);

        const nodeClick = () => {
          interactions?.onNodeClick?.(node.id);
          pulseAt(node.x, node.y);
        };
        const nodeProps = nodeInteractive
          ? {
              role: "button" as const,
              tabIndex: 0,
              "aria-label": `Suggest a worker mine the ${node.kind} node`,
              onClick: nodeClick,
              onKeyDown: (event: ReactKeyboardEvent<SVGElement>) => onSvgActivate(event, nodeClick),
              style: { cursor: "pointer" as const },
            }
          : {};

        return (
          <g key={node.id} opacity={nodeAlpha} {...nodeProps}>
            {nodeInteractive && (
              <circle
                cx={node.x}
                cy={node.y}
                r={coarsePointer ? node.size + 22 : node.size + 10}
                fill="rgba(0,0,0,0.001)"
              />
            )}
            {node.corruption > 0 && (
              <>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.size + 22}
                  fill="rgba(160,50,255,0.22)"
                  opacity={toxicGlow * 1.4}
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.size + 8}
                  fill="none"
                  stroke={`rgba(200,80,255,${(toxicGlow * 1.8).toFixed(2)})`}
                  strokeWidth="1.5"
                />
              </>
            )}
            <circle
              cx={node.x}
              cy={node.y}
              r={node.size + 16}
              fill="url(#fieldGlow)"
              opacity={prefersReducedMotion ? 0.26 : 0.18 + (Math.sin(node.pulse) + 1) * 0.08}
            />
            <circle
              cx={node.x}
              cy={node.y}
              r={node.size}
              fill={node.corrupted ? "rgba(175,90,255,0.2)" : style.fill}
              stroke={node.corrupted ? "rgba(220,160,255,0.74)" : style.stroke}
              strokeWidth="1.5"
            />
            <circle
              cx={node.x - node.size * 0.25}
              cy={node.y - node.size * 0.22}
              r={node.size * 0.32}
              fill={node.corrupted ? "rgba(220,150,255,0.32)" : style.core}
            />
            <rect
              x={hpBarX}
              y={hpBarY}
              rx="4"
              ry="4"
              width={hpBarWidth}
              height="5"
              fill="rgba(255,255,255,0.12)"
            />
            {showRecentWork && (
              <rect
                x={hpBarX + hpWidth}
                y={hpBarY}
                rx="4"
                ry="4"
                width={minedWidth}
                height="5"
                fill={`rgba(255,255,255,${(recentWorkAlpha * 0.28).toFixed(2)})`}
              />
            )}
            <rect
              x={hpBarX}
              y={hpBarY}
              rx="4"
              ry="4"
              width={hpWidth}
              height="5"
              fill="rgba(255,255,255,0.7)"
            />
            {showRecentWork && !lowFxMode && (
              <>
                {Array.from({ length: 4 }, (_, i) => {
                  const fraction = ((node.id * 37 + i * 23) % 100) / 100;
                  const particleX = hpBarX + hpWidth + Math.max(2, minedWidth - 2) * fraction;
                  const particleY = hpBarY + 2 + Math.sin(node.pulse + i * 1.7) * 3;
                  const particleAlpha = recentWorkAlpha * (0.18 + i * 0.04);
                  return (
                    <circle
                      key={`node-work-${node.id}-${i}`}
                      cx={particleX}
                      cy={particleY}
                      r={0.9 + (i % 2) * 0.35}
                      fill={`rgba(255,255,255,${particleAlpha.toFixed(2)})`}
                    />
                  );
                })}
              </>
            )}
            {node.corruption > 0 && (
              <>
                <rect
                  x={node.x - 22}
                  y={node.y + node.size + 18}
                  rx="4"
                  ry="4"
                  width="44"
                  height="4"
                  fill="rgba(255,255,255,0.08)"
                />
                <rect
                  x={node.x - 22}
                  y={node.y + node.size + 18}
                  rx="4"
                  ry="4"
                  width={(44 * corruptionPct) / 100}
                  height="4"
                  fill="rgba(195,120,255,0.92)"
                />
              </>
            )}
            {!lowFxMode && (
              <text
                x={node.x}
                y={node.y + 4}
                textAnchor="middle"
                fontSize="10"
                fill="rgba(0,0,0,1)"
                fontWeight="bold"
                style={{ letterSpacing: 1.5 }}
                filter="url(#textBlur)"
              >
                {node.kind.toUpperCase()}
              </text>
            )}
            <text
              x={node.x}
              y={node.y + 4}
              textAnchor="middle"
              fontSize="10"
              fill={style.label}
              fontWeight="bold"
              style={{ letterSpacing: 1.5 }}
            >
              {node.kind.toUpperCase()}
            </text>
          </g>
        );
      })}

      {game.projectiles.map((projectile) => {
        if (projectile.tag === "turret-missile") {
          const isFrozen = game.frozenMissile?.id === projectile.id;
          const angle = Math.atan2(projectile.vy ?? -1, projectile.vx ?? 0) * (180 / Math.PI);
          const opacity = isFrozen ? 1 : Math.min(1, projectile.life / 12);
          const missileInteractive =
            Boolean(interactions?.onProjectileClick) && game.missileClickCooldown === 0 && !isFrozen;
          const goldFill = "#ffd700";
          const goldAccent = "#ffec6e";
          return (
            <g
              key={projectile.id}
              transform={`translate(${projectile.x1},${projectile.y1}) rotate(${angle})`}
              opacity={opacity}
              role={missileInteractive ? "button" : undefined}
              tabIndex={missileInteractive ? 0 : undefined}
              aria-label={missileInteractive ? "Track the in-flight missile" : undefined}
              onClick={
                missileInteractive ? () => interactions?.onProjectileClick?.(projectile.id) : undefined
              }
              onKeyDown={
                missileInteractive
                  ? (event) => onSvgActivate(event, () => interactions?.onProjectileClick?.(projectile.id))
                  : undefined
              }
              style={missileInteractive ? { cursor: "pointer" } : undefined}
            >
              {missileInteractive && (
                <rect x={-5.5} y={-5} width="11.5" height="10" fill="rgba(0,0,0,0.001)" />
              )}
              {isFrozen ? (
                <>
                  {/* gold nose cone */}
                  <polygon points="6,0 3,-2.5 3,2.5" fill={goldFill} />
                  {/* gold body */}
                  <rect x={-2} y={-2.5} width={5} height={5} rx={1} fill={goldFill} />
                  {/* gold fins */}
                  <polygon points="-2,-2.5 -5,-5 -3,-2.5" fill={goldAccent} />
                  <polygon points="-2,2.5 -5,5 -3,2.5" fill={goldAccent} />
                  {/* shimmer */}
                  <polygon points="-2,-1.5 -5.5,0 -2,1.5" fill="rgba(255,230,80,0.85)" />
                </>
              ) : (
                <>
                  {/* nose cone — red tip */}
                  <polygon points="6,0 3,-2.5 3,2.5" fill="#e53e3e" />
                  {/* body — white/grey */}
                  <rect x={-2} y={-2.5} width={5} height={5} rx={1} fill="#d1d5db" />
                  {/* fins — red */}
                  <polygon points="-2,-2.5 -5,-5 -3,-2.5" fill="#e53e3e" />
                  <polygon points="-2,2.5 -5,5 -3,2.5" fill="#e53e3e" />
                  {/* engine fire — orange */}
                  <polygon points="-2,-1.5 -5.5,0 -2,1.5" fill="rgba(255,140,0,0.9)" />
                </>
              )}
            </g>
          );
        }
        return (
          <g key={projectile.id}>
            <line
              x1={projectile.x1}
              y1={projectile.y1}
              x2={projectile.x2}
              y2={projectile.y2}
              stroke={projectile.color}
              strokeWidth={projectile.width}
              opacity={projectile.life / projectile.maxLife}
              strokeLinecap="round"
            />
            {projectile.tag === "zapper-bolt" && interactions?.onProjectileClick && (
              <line
                x1={projectile.x1}
                y1={projectile.y1}
                x2={projectile.x2}
                y2={projectile.y2}
                stroke="rgba(0,0,0,0.001)"
                strokeWidth={Math.max(12, projectile.width + 10)}
                strokeLinecap="round"
                role="button"
                tabIndex={0}
                aria-label="Trace the zapper bolt"
                onClick={() => interactions.onProjectileClick?.(projectile.id)}
                onKeyDown={(event) =>
                  onSvgActivate(event, () => interactions.onProjectileClick?.(projectile.id))
                }
                style={{ cursor: "pointer" }}
              />
            )}
          </g>
        );
      })}

      {game.workerDeathFlash &&
        (() => {
          const { x, y, ticks, maxTicks } = game.workerDeathFlash;
          const progress = 1 - ticks / maxTicks;
          const alpha = ticks / maxTicks;
          const r = 14 + progress * 28;
          return (
            <g key="worker-death-flash">
              <circle
                cx={x}
                cy={y}
                r={r}
                fill="none"
                stroke={`rgba(80,180,255,${(alpha * 0.9).toFixed(2)})`}
                strokeWidth={3}
              />
              <circle cx={x} cy={y} r={r * 0.55} fill={`rgba(80,200,255,${(alpha * 0.18).toFixed(2)})`} />
            </g>
          );
        })()}

      {game.goldExplosion &&
        (() => {
          const { x, y, ticks, maxTicks } = game.goldExplosion;
          const progress = 1 - ticks / maxTicks;
          const alpha = ticks / maxTicks;
          const r1 = progress * 32;
          const r2 = progress * 18;
          const sparkLen = progress * 22;
          return (
            <g key="gold-explosion">
              {Array.from({ length: 8 }, (_, i) => {
                const a = (i / 8) * Math.PI * 2;
                return (
                  <line
                    key={i}
                    x1={x}
                    y1={y}
                    x2={x + Math.cos(a) * sparkLen}
                    y2={y + Math.sin(a) * sparkLen}
                    stroke={`rgba(255,210,0,${alpha})`}
                    strokeWidth={1.8}
                    strokeLinecap="round"
                  />
                );
              })}
              <circle
                cx={x}
                cy={y}
                r={r1}
                fill="none"
                stroke={`rgba(255,200,0,${alpha * 0.8})`}
                strokeWidth={2.5}
              />
              <circle cx={x} cy={y} r={r2} fill={`rgba(255,230,50,${alpha * 0.25})`} />
              <circle cx={x} cy={y} r={6 * (1 - progress)} fill={`rgba(255,245,150,${alpha})`} />
            </g>
          );
        })()}

      {anomalyInteractive && (
        <g
          transform="translate(868 132)"
          role="button"
          tabIndex={0}
          aria-label="Witness the anomaly artifact"
          onClick={interactions?.onAnomalyClick}
          onKeyDown={(event) => onSvgActivate(event, interactions?.onAnomalyClick)}
          style={{ cursor: "pointer" }}
        >
          <circle r="34" fill="rgba(0,0,0,0.001)" />
          <circle
            r="26"
            fill="rgba(167, 139, 250, 0.09)"
            stroke="rgba(196, 181, 253, 0.48)"
            strokeWidth="1.2"
          />
          <circle
            r="18"
            fill="rgba(109, 40, 217, 0.18)"
            stroke="rgba(233, 213, 255, 0.3)"
            strokeWidth="1"
            strokeDasharray="4 5"
          />
          <path
            d="M 0 -16 L 9 -3 L 4 15 L -4 15 L -9 -3 Z"
            fill="rgba(221, 214, 254, 0.82)"
            stroke="rgba(255,255,255,0.72)"
            strokeWidth="1.1"
          />
          <path
            d="M -2 -10 L 4 -2 L -1 9"
            fill="none"
            stroke="rgba(91, 33, 182, 0.9)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <circle cx="11" cy="-12" r="3" fill="rgba(244, 114, 182, 0.82)" />
        </g>
      )}

      {game.lostDrone && (
        <g
          transform={`translate(${game.lostDrone.x}, ${game.lostDrone.y}) rotate(${(game.lostDrone.angle * 180) / Math.PI})`}
          opacity={spawnAlpha(game.timers.tick, game.lostDrone.spawnTick)}
          role={lostDroneInteractive ? "button" : undefined}
          tabIndex={lostDroneInteractive ? 0 : undefined}
          aria-label={lostDroneInteractive ? "Recover the damaged drone" : undefined}
          onClick={lostDroneInteractive ? interactions?.onLostDroneClick : undefined}
          onKeyDown={
            lostDroneInteractive ? (event) => onSvgActivate(event, interactions?.onLostDroneClick) : undefined
          }
          style={lostDroneInteractive ? { cursor: "pointer" } : undefined}
        >
          {lostDroneInteractive && <circle r={coarsePointer ? 30 : 22} fill="rgba(0,0,0,0.001)" />}
          <ellipse rx="15" ry="11" fill="rgba(209, 213, 219, 0.12)" />
          <ellipse
            rx="10.5"
            ry="8.2"
            fill="rgba(148, 163, 184, 0.55)"
            stroke="rgba(229, 231, 235, 0.42)"
            strokeWidth="1"
          />
          <path
            d="M -7 -6 L 2 0 L -4 7"
            fill="none"
            stroke="rgba(31, 41, 55, 0.82)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="M 4 -7 L 8 -2 L 3 4"
            fill="none"
            stroke="rgba(55, 65, 81, 0.75)"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <rect x="-3" y="-15" width="8" height="5" rx="1.5" fill="rgba(100, 116, 139, 0.85)" />
          <circle
            cx="2"
            cy="-12"
            r="2.1"
            fill={game.timers.tick % 16 < 6 ? "rgba(148, 163, 184, 0.45)" : "rgba(248, 113, 113, 0.85)"}
          />
          <path d="M 8 5 L 16 10" stroke="rgba(100, 116, 139, 0.8)" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="17.5" cy="10.5" r="1.4" fill="rgba(226, 232, 240, 0.4)" />
        </g>
      )}

      {game.enemies.map((enemy) => {
        const hpPct = clamp((enemy.hp / enemy.maxHp) * 100, 0, 100);
        const enemyFadeAlpha =
          enemy.hp <= 0 ? deathAlpha(enemy.dyingTicks) : spawnAlpha(game.timers.tick, enemy.spawnTick);
        const corpseInteractive =
          Boolean(interactions?.onEnemyClick) && enemy.hp <= 0 && enemy.dyingTicks > 0;
        // 4.0 Phase 3 — live combat enemies open the ENEMY inspect popover (whose
        // "Mark priority" button is what nudges defenses). Corpses stay on the
        // achievement handler above, so the achievement click keeps winning its
        // ties — the two states are mutually exclusive by hp. Corruptors are
        // purge-wing targets (not turret-scored), so they carry no inspect.
        const inspectInteractive = enemyInspectInteractive && enemy.hp > 0 && enemy.role !== "corruptor";
        const inspectClick = (event: ReactMouseEvent<SVGElement> | ReactKeyboardEvent<SVGElement>) => {
          interactions?.onEnemyInspect?.(enemy.id, inspectAnchor(event));
          pulseAt(enemy.x, enemy.y);
        };
        const enemyInteractiveProps = corpseInteractive
          ? {
              role: "button" as const,
              tabIndex: 0,
              "aria-label": "Inspect the fading enemy wreck",
              onClick: () => interactions?.onEnemyClick?.(enemy.id),
              onKeyDown: (event: ReactKeyboardEvent<SVGElement>) =>
                onSvgActivate(event, () => interactions?.onEnemyClick?.(enemy.id)),
              style: { cursor: "pointer" },
            }
          : inspectInteractive
            ? {
                role: "button" as const,
                tabIndex: 0,
                "aria-label": "Inspect this enemy",
                onClick: inspectClick,
                onKeyDown: (event: ReactKeyboardEvent<SVGElement>) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  inspectClick(event);
                },
                style: { cursor: "pointer" },
              }
            : {};

        if (enemy.role === "corruptor") {
          const wobble = Math.sin((game.timers.tick + enemy.id * 11) / 7) * 2;
          return (
            <g key={enemy.id} opacity={enemyFadeAlpha} {...enemyInteractiveProps}>
              {corpseInteractive && (
                <circle cx={enemy.x} cy={enemy.y} r={coarsePointer ? 34 : 24} fill="rgba(0,0,0,0.001)" />
              )}
              <circle cx={enemy.x} cy={enemy.y} r="22" fill="rgba(160,70,255,0.08)" />
              <circle
                cx={enemy.x}
                cy={enemy.y}
                r={12 + wobble * 0.15}
                fill={enemy.flash ? "rgba(255,255,255,0.82)" : "rgba(172,92,255,0.82)"}
                stroke="rgba(240,190,255,0.55)"
                strokeWidth="1.4"
              />
              <circle cx={enemy.x - 5} cy={enemy.y - 5} r="4" fill="rgba(245,210,255,0.75)" />
              <path
                d={`M ${enemy.x - 9} ${enemy.y + 9} q 7 10 18 4`}
                stroke="rgba(235,180,255,0.7)"
                strokeWidth="2"
                fill="none"
              />
              <rect
                x={enemy.x - 16}
                y={enemy.y + 18}
                rx="4"
                ry="4"
                width="32"
                height="4"
                fill="rgba(255,255,255,0.12)"
              />
              <rect
                x={enemy.x - 16}
                y={enemy.y + 18}
                rx="4"
                ry="4"
                width={(32 * hpPct) / 100}
                height="4"
                fill="rgba(210,140,255,0.95)"
              />
            </g>
          );
        }

        const style = ENEMY_STYLE[enemy.kind as Exclude<typeof enemy.kind, "corruptor">];
        // Touch: on coarse pointers give both fading wrecks AND live inspectable
        // enemies an enlarged transparent hit-halo. On desktop (fine pointer) the
        // corpse keeps its existing small halo and live enemies keep relying on
        // their visible geometry — so desktop click precision is unchanged.
        const enemyHitR = coarsePointer ? style.radius + 24 : style.radius + 12;
        const showEnemyHit = corpseInteractive || (inspectInteractive && coarsePointer);
        const enemyOpacity = (isCloaked(enemy) ? 0.2 : 1) * enemyFadeAlpha;
        const threatPulse = 0.12 + Math.sin((game.timers.tick + enemy.id * 7) / 10) * 0.07;
        const threatRing = (
          <circle
            cx={enemy.x}
            cy={enemy.y}
            r={style.radius + 18}
            fill={`rgba(220,30,30,${threatPulse.toFixed(2)})`}
            stroke="rgba(255,60,60,0.45)"
            strokeWidth="1.2"
            opacity={enemyOpacity}
          />
        );

        // Shield overlay — rendered for any enemy that carries a shield layer
        // (leech, phantom, zapper). Draws a translucent arc ring around the
        // enemy whose opacity tracks shield fullness, plus a small shield bar
        // stacked above the HP bar so the shield reads as the outer layer.
        // Regenerating shields pulse subtly to telegraph that damage was
        // recently absorbed.
        const hasShield = enemy.shield !== undefined && enemy.shieldMax !== undefined && enemy.shieldMax > 0;
        const shieldPct = hasShield ? clamp((enemy.shield! / enemy.shieldMax!) * 100, 0, 100) : 0;
        const shieldRegenerating =
          hasShield && enemy.shield! < enemy.shieldMax! && (enemy.shieldRegenCooldown ?? 0) === 0;
        const shieldPulse = shieldRegenerating
          ? 0.55 + Math.sin((game.timers.tick + enemy.id * 9) / 6) * 0.25
          : 0.7;
        const shieldRing =
          hasShield && shieldPct > 0 ? (
            <circle
              cx={enemy.x}
              cy={enemy.y}
              r={style.radius + 7}
              fill="none"
              stroke={`rgba(140,220,255,${((shieldPct / 100) * shieldPulse * 0.85).toFixed(2)})`}
              strokeWidth="1.8"
              strokeDasharray="3 2.5"
            />
          ) : null;
        const shieldGlow =
          hasShield && shieldPct > 0 ? (
            <circle
              cx={enemy.x}
              cy={enemy.y}
              r={style.radius + 12}
              fill={`rgba(140,220,255,${((shieldPct / 100) * 0.09).toFixed(2)})`}
            />
          ) : null;
        const shieldBar = hasShield ? (
          <>
            <rect
              x={enemy.x - 16}
              y={enemy.y - style.radius - 18}
              rx="3"
              ry="3"
              width="32"
              height="3"
              fill="rgba(255,255,255,0.10)"
            />
            <rect
              x={enemy.x - 16}
              y={enemy.y - style.radius - 18}
              rx="3"
              ry="3"
              width={(32 * shieldPct) / 100}
              height="3"
              fill="rgba(140,220,255,0.95)"
            />
          </>
        ) : null;

        if (enemy.kind === "raider") {
          return (
            <g key={enemy.id} opacity={enemyOpacity} {...enemyInteractiveProps}>
              {showEnemyHit && <circle cx={enemy.x} cy={enemy.y} r={enemyHitR} fill="rgba(0,0,0,0.001)" />}
              {threatRing}
              <circle cx={enemy.x} cy={enemy.y} r={style.radius + 14} fill={style.glow} />
              {/* thick outer armour ring */}
              <rect
                x={enemy.x - 20}
                y={enemy.y - 20}
                width="40"
                height="40"
                rx="5"
                fill="rgba(100,10,25,0.55)"
                stroke={style.stroke}
                strokeWidth="2.5"
              />
              {/* inner body */}
              <rect
                x={enemy.x - 14}
                y={enemy.y - 14}
                width="28"
                height="28"
                rx="3"
                fill={enemy.flash ? "rgba(255,255,255,0.82)" : style.fill}
                stroke="rgba(255,100,120,0.5)"
                strokeWidth="1"
              />
              {/* armour cross marks */}
              <line
                x1={enemy.x - 10}
                y1={enemy.y}
                x2={enemy.x + 10}
                y2={enemy.y}
                stroke="rgba(255,180,190,0.7)"
                strokeWidth="2"
              />
              <line
                x1={enemy.x}
                y1={enemy.y - 10}
                x2={enemy.x}
                y2={enemy.y + 10}
                stroke="rgba(255,180,190,0.7)"
                strokeWidth="2"
              />
              <rect
                x={enemy.x - 18}
                y={enemy.y + style.radius + 10}
                rx="4"
                ry="4"
                width="36"
                height="5"
                fill="rgba(255,255,255,0.12)"
              />
              <rect
                x={enemy.x - 18}
                y={enemy.y + style.radius + 10}
                rx="4"
                ry="4"
                width={(36 * hpPct) / 100}
                height="5"
                fill="rgba(255,100,130,0.95)"
              />
            </g>
          );
        }

        if (enemy.kind === "wisp") {
          return (
            <g key={enemy.id} opacity={enemyOpacity} {...enemyInteractiveProps}>
              {showEnemyHit && <circle cx={enemy.x} cy={enemy.y} r={enemyHitR} fill="rgba(0,0,0,0.001)" />}
              {/* motion trail — diamonds fading out behind the wisp */}
              {enemy.trail.map(([tx, ty], i) => {
                const t = (i + 1) / enemy.trail.length;
                const alpha = t * 0.75;
                const size = style.radius * t;
                return (
                  <path
                    key={i}
                    d={`M ${tx} ${ty - size} L ${tx + size * 0.6} ${ty} L ${tx} ${ty + size} L ${tx - size * 0.6} ${ty} Z`}
                    fill={`rgba(90,210,175,${alpha.toFixed(2)})`}
                    stroke={`rgba(180,240,220,${(alpha * 0.6).toFixed(2)})`}
                    strokeWidth="0.8"
                  />
                );
              })}
              {threatRing}
              <circle cx={enemy.x} cy={enemy.y} r={style.radius + 14} fill={style.glow} />
              {/* elongated narrow diamond — tall and thin to signal speed */}
              <path
                d={`M ${enemy.x} ${enemy.y - 15} L ${enemy.x + 7} ${enemy.y} L ${enemy.x} ${enemy.y + 15} L ${enemy.x - 7} ${enemy.y} Z`}
                fill={enemy.flash ? "rgba(255,255,255,0.82)" : style.fill}
                stroke={style.stroke}
                strokeWidth="1.4"
              />
              {/* inner bright core */}
              <circle cx={enemy.x} cy={enemy.y} r="3" fill="rgba(200,245,230,0.9)" />
              <rect
                x={enemy.x - 16}
                y={enemy.y + style.radius + 8}
                rx="4"
                ry="4"
                width="32"
                height="4"
                fill="rgba(255,255,255,0.12)"
              />
              <rect
                x={enemy.x - 16}
                y={enemy.y + style.radius + 8}
                rx="4"
                ry="4"
                width={(32 * hpPct) / 100}
                height="4"
                fill="rgba(90,210,175,0.95)"
              />
            </g>
          );
        }

        if (enemy.kind === "zapper") {
          const arcPulse = Math.sin((game.timers.tick + enemy.id * 5) / 8) * 0.4 + 0.6;
          const charged = enemy.fireCooldown !== undefined && enemy.fireCooldown < 15;
          return (
            <g key={enemy.id} opacity={enemyOpacity} {...enemyInteractiveProps}>
              {showEnemyHit && <circle cx={enemy.x} cy={enemy.y} r={enemyHitR} fill="rgba(0,0,0,0.001)" />}
              {threatRing}
              {shieldGlow}
              <circle cx={enemy.x} cy={enemy.y} r={style.radius + 14} fill={style.glow} />
              {/* triangular body */}
              <path
                d={`M ${enemy.x} ${enemy.y - 13} L ${enemy.x + 11} ${enemy.y + 9} L ${enemy.x - 11} ${enemy.y + 9} Z`}
                fill={enemy.flash ? "rgba(255,255,255,0.82)" : style.fill}
                stroke={style.stroke}
                strokeWidth="1.5"
              />
              {/* arc-antenna prongs */}
              <line
                x1={enemy.x - 4}
                y1={enemy.y - 9}
                x2={enemy.x - 10}
                y2={enemy.y - 19}
                stroke="rgba(210,130,255,0.85)"
                strokeWidth="1.5"
              />
              <line
                x1={enemy.x + 4}
                y1={enemy.y - 9}
                x2={enemy.x + 10}
                y2={enemy.y - 19}
                stroke="rgba(210,130,255,0.85)"
                strokeWidth="1.5"
              />
              {/* charge orb at antenna tip — pulses brighter when ready to fire */}
              <circle
                cx={enemy.x - 10}
                cy={enemy.y - 19}
                r="2.5"
                fill={charged ? "rgba(230,160,255,0.98)" : `rgba(180,80,255,${arcPulse.toFixed(2)})`}
              />
              <circle
                cx={enemy.x + 10}
                cy={enemy.y - 19}
                r="2.5"
                fill={charged ? "rgba(230,160,255,0.98)" : `rgba(180,80,255,${arcPulse.toFixed(2)})`}
              />
              {shieldRing}
              <rect
                x={enemy.x - 16}
                y={enemy.y + style.radius + 8}
                rx="4"
                ry="4"
                width="32"
                height="4"
                fill="rgba(255,255,255,0.12)"
              />
              <rect
                x={enemy.x - 16}
                y={enemy.y + style.radius + 8}
                rx="4"
                ry="4"
                width={(32 * hpPct) / 100}
                height="4"
                fill="rgba(180,80,255,0.95)"
              />
              {shieldBar}
            </g>
          );
        }

        // mite — small fast circle with sharp antenna spikes
        if (enemy.kind === "sapper") {
          return (
            <g key={enemy.id} opacity={enemyOpacity} {...enemyInteractiveProps}>
              {showEnemyHit && <circle cx={enemy.x} cy={enemy.y} r={enemyHitR} fill="rgba(0,0,0,0.001)" />}
              <circle
                cx={enemy.x}
                cy={enemy.y}
                r="60"
                fill="none"
                stroke="#f43f5e"
                strokeWidth="0.5"
                opacity="0.3"
              />
              {threatRing}
              <circle cx={enemy.x} cy={enemy.y} r={style.radius + 11} fill={style.glow} />
              <circle
                cx={enemy.x}
                cy={enemy.y}
                r={style.radius}
                fill={enemy.flash ? "rgba(255,255,255,0.82)" : style.fill}
                stroke={style.stroke}
                strokeWidth="1.5"
              />
              <line
                x1={enemy.x}
                y1={enemy.y - 10}
                x2={enemy.x}
                y2={enemy.y + 10}
                stroke="rgba(255,230,230,0.8)"
                strokeWidth="1.5"
              />
              <line
                x1={enemy.x - 10}
                y1={enemy.y}
                x2={enemy.x + 10}
                y2={enemy.y}
                stroke="rgba(255,230,230,0.8)"
                strokeWidth="1.5"
              />
            </g>
          );
        }

        return (
          <g key={enemy.id} opacity={enemyOpacity} {...enemyInteractiveProps}>
            {showEnemyHit && <circle cx={enemy.x} cy={enemy.y} r={enemyHitR} fill="rgba(0,0,0,0.001)" />}
            {threatRing}
            {shieldGlow}
            <circle cx={enemy.x} cy={enemy.y} r={style.radius + 11} fill={style.glow} />
            <circle
              cx={enemy.x}
              cy={enemy.y}
              r={style.radius}
              fill={enemy.flash ? "rgba(255,255,255,0.82)" : style.fill}
              stroke={style.stroke}
              strokeWidth="1.5"
            />
            {/* sharp antenna spikes */}
            <line
              x1={enemy.x - 5}
              y1={enemy.y - 7}
              x2={enemy.x - 10}
              y2={enemy.y - 16}
              stroke="rgba(255,200,100,0.75)"
              strokeWidth="1.5"
            />
            <line
              x1={enemy.x + 5}
              y1={enemy.y - 7}
              x2={enemy.x + 10}
              y2={enemy.y - 16}
              stroke="rgba(255,200,100,0.75)"
              strokeWidth="1.5"
            />
            <circle cx={enemy.x - 10} cy={enemy.y - 16} r="1.5" fill="rgba(255,230,160,0.9)" />
            <circle cx={enemy.x + 10} cy={enemy.y - 16} r="1.5" fill="rgba(255,230,160,0.9)" />
            {shieldRing}
            <rect
              x={enemy.x - 16}
              y={enemy.y + style.radius + 8}
              rx="4"
              ry="4"
              width="32"
              height="4"
              fill="rgba(255,255,255,0.12)"
            />
            <rect
              x={enemy.x - 16}
              y={enemy.y + style.radius + 8}
              rx="4"
              ry="4"
              width={(32 * hpPct) / 100}
              height="4"
              fill="rgba(255,165,60,0.95)"
            />
            {shieldBar}
          </g>
        );
      })}

      {game.scouts.map((scout, index) => {
        const live = index < derived.activeScouts;
        const bob = prefersReducedMotion ? 0 : Math.sin(scout.pulse) * 2.2;

        if (!live) return null;

        // 3.0.0: during reboot the pad is empty — we already hide the scout
        // sprite. While retreating the chrome shifts to a warmer tint; the
        // hp bar appears any time hp is below max.
        const rebooting = scout.rebootTicks > 0;
        if (rebooting) return null;

        const retreating = scout.retreating;
        const hpPct = scout.maxHp > 0 ? clamp(scout.hp / scout.maxHp, 0, 1) : 1;
        const showHpBar = hpPct < 1 - 1e-3;
        const damageFlash = scout.damageTicks > 0 ? Math.min(0.85, scout.damageTicks / 12) : 0;
        const bodyStroke = retreating ? "rgba(255,180,120,0.6)" : "rgba(120,220,255,0.42)";
        const hullFill = retreating ? "rgba(255,180,120,0.18)" : "rgba(160,235,255,0.86)";
        const beamStroke = retreating ? "rgba(255,180,120,0.7)" : "rgba(120,220,255,0.90)";

        return (
          <g key={scout.id}>
            {!retreating && (
              <line
                x1={scout.x}
                y1={scout.y}
                x2={scout.tx}
                y2={scout.ty}
                stroke="rgba(80,200,255,0.12)"
                strokeDasharray="4 4"
              />
            )}
            {damageFlash > 0 && (
              <circle
                cx={scout.x}
                cy={scout.y + bob}
                r="18"
                fill={`rgba(255,80,80,${damageFlash.toFixed(2)})`}
              />
            )}
            <circle
              cx={scout.x}
              cy={scout.y + bob}
              r="16"
              fill="rgba(80,200,255,0.10)"
              stroke={bodyStroke}
              strokeWidth="1.1"
            />
            <path
              d={`M ${scout.x} ${scout.y + bob - 8} L ${scout.x + 5.5} ${scout.y + bob + 1.5} L ${scout.x} ${scout.y + bob + 8} L ${scout.x - 5.5} ${scout.y + bob + 1.5} Z`}
              fill={hullFill}
              stroke="rgba(210,248,255,0.82)"
              strokeWidth="1"
              opacity="0.94"
            />
            <circle cx={scout.x} cy={scout.y + bob - 0.5} r="3" fill="rgba(120,255,210,0.6)" />
            <line
              x1={scout.x}
              y1={scout.y + bob}
              x2={scout.x + Math.cos(scout.angle) * 18}
              y2={scout.y + bob + Math.sin(scout.angle) * 18}
              stroke={beamStroke}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {showHpBar && (
              <>
                <rect
                  x={scout.x - 14}
                  y={scout.y + bob + 14}
                  rx="2"
                  ry="2"
                  width="28"
                  height="3"
                  fill="rgba(0,0,0,0.45)"
                />
                <rect
                  x={scout.x - 14}
                  y={scout.y + bob + 14}
                  rx="2"
                  ry="2"
                  width={28 * hpPct}
                  height="3"
                  fill={hpPct < SCOUT_HP.retreatHpRatio ? "rgba(255,160,120,0.9)" : "rgba(160,235,255,0.85)"}
                />
              </>
            )}
          </g>
        );
      })}

      {game.sentinels.map((sentinel, index) => {
        const live = index < derived.activeSentinels;
        if (!live) return null;

        // 3.0.0: hide the sentinel body while rebooting at home; retreating
        // dims chassis + triangle fill toward a warmer tint; HP bar appears
        // any time HP is below max.
        const rebooting = sentinel.rebootTicks > 0;
        if (rebooting) return null;

        const retreating = sentinel.retreating;
        const pulse = Math.sin(sentinel.pulse) * 0.15 + 0.85;
        const size = 9;
        const points = [
          `${sentinel.x},${sentinel.y - size}`,
          `${sentinel.x + size * 0.7},${sentinel.y}`,
          `${sentinel.x},${sentinel.y + size}`,
          `${sentinel.x - size * 0.7},${sentinel.y}`,
        ].join(" ");
        const hpPct = sentinel.maxHp > 0 ? clamp(sentinel.hp / sentinel.maxHp, 0, 1) : 1;
        const showHpBar = hpPct < 1 - 1e-3;
        const damageFlash = sentinel.damageTicks > 0 ? Math.min(0.85, sentinel.damageTicks / 12) : 0;
        const bodyFill = retreating ? "#c2410c" : "#fbbf24";
        const bodyStroke = retreating ? "#7c2d12" : "#f59e0b";

        return (
          <g key={sentinel.id}>
            {damageFlash > 0 && (
              <circle
                cx={sentinel.x}
                cy={sentinel.y}
                r="14"
                fill={`rgba(255,80,80,${damageFlash.toFixed(2)})`}
              />
            )}
            <g transform={`rotate(${(sentinel.angle * 180) / Math.PI + 90}, ${sentinel.x}, ${sentinel.y})`}>
              {sentinel.task === "Engaging" && (
                <circle
                  cx={sentinel.x}
                  cy={sentinel.y}
                  r={SENTINEL.rangeBase}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="0.4"
                  opacity="0.15"
                />
              )}
              <polygon
                points={points}
                fill={bodyFill}
                opacity={pulse}
                stroke={bodyStroke}
                strokeWidth="1.5"
              />
            </g>
            {showHpBar && (
              <>
                <rect
                  x={sentinel.x - 14}
                  y={sentinel.y + 12}
                  rx="2"
                  ry="2"
                  width="28"
                  height="3"
                  fill="rgba(0,0,0,0.45)"
                />
                <rect
                  x={sentinel.x - 14}
                  y={sentinel.y + 12}
                  rx="2"
                  ry="2"
                  width={28 * hpPct}
                  height="3"
                  fill={
                    hpPct < SENTINEL_HP.retreatHpRatio ? "rgba(255,120,80,0.92)" : "rgba(251,191,36,0.88)"
                  }
                />
              </>
            )}
          </g>
        );
      })}

      {game.touristWorker?.active && (
        <g
          transform={`translate(${game.touristWorker.x}, ${game.touristWorker.y}) rotate(${(game.touristWorker.angle * 180) / Math.PI}) scale(${1 + Math.sin((game.touristWorker.squishTicks / 9) * Math.PI) * 0.16} ${1 - Math.sin((game.touristWorker.squishTicks / 9) * Math.PI) * 0.1})`}
          role={touristInteractive ? "button" : undefined}
          tabIndex={touristInteractive ? 0 : undefined}
          aria-label={touristInteractive ? "Spot the tourist drone" : undefined}
          onClick={touristInteractive ? interactions?.onTouristClick : undefined}
          onKeyDown={
            touristInteractive ? (event) => onSvgActivate(event, interactions?.onTouristClick) : undefined
          }
          style={touristInteractive ? { cursor: "pointer", outline: "none" } : undefined}
        >
          {/* Transparent hit area so the tiny tourist is still reasonably clickable. */}
          {touristInteractive && <circle r={coarsePointer ? 26 : 16} fill="rgba(0,0,0,0.001)" />}
          <circle r="8" fill="rgba(253, 230, 138, 0.16)" />
          <circle r="5" fill="#fde68a" stroke="#f59e0b" strokeWidth="1" />
          <rect x="5" y="-3" width="6" height="4" rx="1" fill="#374151" />
          <circle cx="8" cy="-1" r="1.5" fill={game.touristWorker.squishTicks > 0 ? "#93c5fd" : "#60a5fa"} />
        </g>
      )}

      {game.agents
        .filter((agent) => agent.active)
        .map((agent) => {
          const bob = prefersReducedMotion ? 0 : Math.sin((game.timers.tick + agent.id * 8) / 7) * 2;
          const shieldActive = game.upgrades.shield > 0;
          const panicOpacity = clamp(agent.panic / 100, 0, 1) * 0.22;
          const dotColor = AGENT_STYLE[agent.kind];
          const damaged = agent.hp < 35;
          const agentAlpha = spawnAlpha(game.timers.tick, agent.spawnTick);
          const agentDisabled = agent.disabledTicks > 0;
          const agentDisablePulse = 0.3 + Math.sin(game.timers.tick / 5) * 0.2;
          // 3.0.0 Step 7: Corruption visuals.
          const isCorrupted = agent.corrupted;
          const isRebooting = agent.rebootTicks > 0;
          // Shake amplitude grows with corruptionTicks, capped at 3 px.
          const corruptShake =
            isCorrupted && !prefersReducedMotion ? Math.min(3, agent.corruptionTicks / 400) : 0;
          const corruptShakeX = corruptShake * Math.sin(game.timers.tick * 1.7 + agent.id);
          const corruptShakeY = corruptShake * Math.cos(game.timers.tick * 2.3 + agent.id * 0.7);
          const corruptPulse = 0.45 + Math.sin(game.timers.tick / 9) * 0.2;
          const attachProgress =
            agent.corruptingTicks > 0 && !isCorrupted
              ? agent.corruptingTicks / 210 // WARDEN.attachTicks
              : 0;
          // Override body colours when corrupted or rebooting.
          const bodyFill = isCorrupted
            ? "rgba(120,40,180,0.55)"
            : isRebooting
              ? "rgba(60,60,90,0.45)"
              : damaged
                ? "rgba(255,130,130,0.32)"
                : "rgba(40,110,180,0.50)";
          const bodyStroke = isCorrupted
            ? "rgba(192,132,252,0.85)"
            : isRebooting
              ? "rgba(140,140,180,0.55)"
              : damaged
                ? "rgba(255,150,150,0.75)"
                : "rgba(120,220,255,0.80)";

          // hexagon points helper — module-hoisted (hexPoints) to avoid per-render closure allocation.
          const hex = hexPoints;

          // 4.1.0 Fix 1(c): while a worker carries an active `kind: "node"`
          // suggestion, surface a subtle "tasked" line to the target node so the
          // player SEES the nudge took. The sim clears the marker on arrival /
          // expiry / node-gone, so a present marker whose node still exists is a
          // good proxy for "active". Respects the coarse-pointer FX budget: the
          // node marker pulses only when full FX are on, otherwise a static ring.
          const taskedNode =
            agent.suggestedTarget?.kind === "node" && agent.suggestedTarget.id != null
              ? game.nodes.find((n) => n.id === Number(agent.suggestedTarget!.id))
              : undefined;

          // 4.0 Phase 3 — clicking a worker opens the inspect popover.
          const workerClick = (event: ReactMouseEvent<SVGElement> | ReactKeyboardEvent<SVGElement>) => {
            interactions?.onWorkerInspect?.(agent.id, inspectAnchor(event));
          };
          const workerProps = workerInspectInteractive
            ? {
                role: "button" as const,
                tabIndex: 0,
                "aria-label": `Inspect ${agent.kind} worker`,
                onClick: workerClick,
                onKeyDown: (event: ReactKeyboardEvent<SVGElement>) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  workerClick(event);
                },
                style: { cursor: "pointer" as const },
              }
            : {};

          return (
            <g
              key={agent.id}
              {...workerProps}
              opacity={isRebooting ? agentAlpha * 0.45 : agentAlpha}
              style={agentDisabled ? { filter: "grayscale(1)", ...workerProps.style } : workerProps.style}
              transform={
                corruptShakeX !== 0 || corruptShakeY !== 0
                  ? `translate(${corruptShakeX.toFixed(2)},${corruptShakeY.toFixed(2)})`
                  : undefined
              }
            >
              {workerInspectInteractive && (
                <circle
                  cx={agent.x}
                  cy={agent.y + bob}
                  r={coarsePointer ? 28 : 18}
                  fill="rgba(0,0,0,0.001)"
                />
              )}
              {/* 4.1.0 Fix 1(c): "tasked" nudge indicator — a subtle cyan lead
                  line from the worker to its suggested node. */}
              {taskedNode && (
                <g style={{ pointerEvents: "none" }}>
                  <line
                    x1={agent.x}
                    y1={agent.y + bob}
                    x2={taskedNode.x}
                    y2={taskedNode.y}
                    stroke="rgba(120,220,255,0.32)"
                    strokeWidth="1.5"
                    strokeDasharray="4 5"
                    strokeLinecap="round"
                  />
                  <circle
                    cx={taskedNode.x}
                    cy={taskedNode.y}
                    r={reduceFx ? 12 : 11 + Math.sin(game.timers.tick / 6) * 2}
                    fill="none"
                    stroke="rgba(120,220,255,0.5)"
                    strokeWidth="1.5"
                  />
                </g>
              )}
              {agentDisabled && (
                <circle
                  cx={agent.x}
                  cy={agent.y + bob}
                  r="26"
                  fill="none"
                  stroke={`rgba(255,120,40,${agentDisablePulse.toFixed(2)})`}
                  strokeWidth="2.5"
                />
              )}
              {/* 3.0.0 Step 7: warden-attach warning ring (pre-corruption) */}
              {attachProgress > 0 && (
                <circle
                  cx={agent.x}
                  cy={agent.y + bob}
                  r="28"
                  fill="none"
                  stroke={`rgba(220,160,60,${(attachProgress * 0.6).toFixed(2)})`}
                  strokeWidth="2"
                  strokeDasharray={`${(attachProgress * 30).toFixed(1)} 5`}
                />
              )}
              {/* 3.0.0 Step 7: pulsing void-purple ring when fully corrupted */}
              {isCorrupted && (
                <circle
                  cx={agent.x}
                  cy={agent.y + bob}
                  r="30"
                  fill={`rgba(120,40,180,${(corruptPulse * 0.18).toFixed(2)})`}
                  stroke={`rgba(192,132,252,${corruptPulse.toFixed(2)})`}
                  strokeWidth="2.5"
                />
              )}
              {/* 3.1.2: HP-charge ring shown while rebooting after combat death.
                  Standard progress-ring composition: full-period dasharray,
                  shrinking dashoffset, -90° rotation so the arc starts at 12
                  o'clock and grows clockwise from 0 to a full ring. */}
              {isRebooting &&
                agent.hp < agent.maxHp &&
                (() => {
                  const hpFrac = agent.maxHp > 0 ? agent.hp / agent.maxHp : 0;
                  const circumference = 2 * Math.PI * 24;
                  return (
                    <circle
                      cx={agent.x}
                      cy={agent.y + bob}
                      r="24"
                      fill="none"
                      stroke="rgba(80,200,255,0.70)"
                      strokeWidth="3"
                      strokeDasharray={circumference.toFixed(1)}
                      strokeDashoffset={((1 - hpFrac) * circumference).toFixed(1)}
                      strokeLinecap="round"
                      transform={`rotate(-90 ${agent.x} ${agent.y + bob})`}
                    />
                  );
                })()}
              <line
                x1={agent.x}
                y1={agent.y}
                x2={agent.tx}
                y2={agent.ty}
                stroke="rgba(255,255,255,0.09)"
                strokeDasharray="4 5"
              />
              {agent.veteranRank > 0 &&
                Array.from({ length: agent.veteranRank }, (_, index) => (
                  <path
                    key={`rank-${agent.id}-${index}`}
                    d={`M ${agent.x - 6 + index * 5} ${agent.y - 14} l 2 -3 l 2 3`}
                    stroke="#fde68a"
                    strokeWidth="0.8"
                    fill="none"
                    opacity="0.8"
                  />
                ))}
              {panicOpacity > 0 && (
                <circle
                  cx={agent.x}
                  cy={agent.y + bob}
                  r={20 + agent.panic * 0.04}
                  fill={`rgba(255, 120, 120, ${panicOpacity})`}
                />
              )}
              {shieldActive && (
                <circle
                  cx={agent.x}
                  cy={agent.y + bob}
                  r={19 + game.upgrades.shield * 1.5}
                  fill="none"
                  stroke="rgba(150,220,255,0.22)"
                  strokeWidth="2"
                />
              )}
              <circle
                cx={agent.x}
                cy={agent.y + bob}
                r="22"
                fill="rgba(80,200,255,0.08)"
                stroke="rgba(80,200,255,0.18)"
                strokeWidth="1"
              />

              {agent.kind === "miner" &&
                (() => {
                  // 3.2.1 — swing goes 0-23 then wraps. The previous curve was
                  // `sin(πt)^0.55`, which left a non-zero residual at t≈1 and
                  // snapped to 0 at the wrap, causing a one-tick visual gap.
                  // The cosine form `(½(1−cos(2πt)))^0.55` (equivalent to
                  // `sin(πt)²` raised to 0.55) lands smoothly with zero
                  // derivative at both t=0 and t=1, so the arm rests cleanly
                  // through the wraparound. Apex stays at t=0.5 (swing=12).
                  // Gate on active-mining task (not on swing>0) — the wrap
                  // hits swing=0 every cycle, so a swing-based gate strobes
                  // the arm. Task changes only at state boundaries.
                  const isMining = agent.task === "Mining" || agent.task === "Purging residue";
                  if (!isMining) {
                    return (
                      <>
                        <polygon
                          points={hex(agent.x, agent.y + bob, 13)}
                          fill={bodyFill}
                          stroke={bodyStroke}
                          strokeWidth="2"
                        />
                        <circle cx={agent.x} cy={agent.y + bob} r="5" fill={dotColor} />
                      </>
                    );
                  }
                  const swingT = agent.swing / 24;
                  const swingProgress = Math.pow(0.5 * (1 - Math.cos(swingT * 2 * Math.PI)), 0.55);
                  // arm pivots from right shoulder, sweeps from raised (-2.0 rad) to strike (-0.35 rad)
                  const pickAngle = -2.0 + swingProgress * 1.65;
                  const shoulderX = agent.x + 7;
                  const shoulderY = agent.y + bob - 4;
                  const armLen = 17;
                  const tipX = shoulderX + Math.cos(pickAngle) * armLen;
                  const tipY = shoulderY + Math.sin(pickAngle) * armLen;
                  // pickaxe head — small cross perpendicular to arm
                  const headAngle = pickAngle + Math.PI / 2;
                  const h1x = tipX + Math.cos(headAngle) * 5;
                  const h1y = tipY + Math.sin(headAngle) * 5;
                  const h2x = tipX - Math.cos(headAngle) * 3;
                  const h2y = tipY - Math.sin(headAngle) * 3;
                  const isStriking = swingProgress > 0.88;
                  return (
                    // hexagon — sturdy, industrial
                    <>
                      <polygon
                        points={hex(agent.x, agent.y + bob, 13)}
                        fill={bodyFill}
                        stroke={bodyStroke}
                        strokeWidth="2"
                      />
                      <circle cx={agent.x} cy={agent.y + bob} r="5" fill={dotColor} />
                      {/* arm — always rendered so wraparound doesn't blink */}
                      <line
                        x1={shoulderX}
                        y1={shoulderY}
                        x2={tipX}
                        y2={tipY}
                        stroke="rgba(160,235,255,0.90)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      {/* pickaxe head */}
                      <line
                        x1={h1x}
                        y1={h1y}
                        x2={h2x}
                        y2={h2y}
                        stroke={dotColor}
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      {/* impact spark at strike */}
                      {isStriking && (
                        <circle
                          cx={tipX}
                          cy={tipY}
                          r="4"
                          fill="none"
                          stroke={dotColor}
                          strokeWidth="1.2"
                          opacity="0.85"
                        />
                      )}
                    </>
                  );
                })()}

              {agent.kind === "runner" &&
                (() => {
                  const tdx = agent.tx - agent.x;
                  const tdy = agent.ty - agent.y;
                  const td = Math.hypot(tdx, tdy) || 1;
                  const towardX = tdx / td;
                  const towardY = tdy / td;
                  const tailX = -towardX;
                  const tailY = -towardY;
                  const perpX = -tailY;
                  const perpY = tailX;

                  // jointed arm sweeps in an arc perpendicular to travel direction
                  // upper arm is fixed; forearm hinges at elbow to sweep toward node
                  const swingT = agent.swing / 24;
                  // sweep: 0 = arm folded back, 1 = arm fully extended scooping inward
                  const sweep = agent.swing > 0 ? Math.pow(Math.sin(swingT * Math.PI), 0.6) : 0;
                  const upperLen = 9;
                  const foreLen = 9;
                  // shoulder: offset perpendicular to travel so the arm swings from the side
                  const shoulderX = agent.x + perpX * 10;
                  const shoulderY = agent.y + bob + perpY * 10;
                  // elbow: upper arm points outward from shoulder
                  const elbowX = shoulderX + perpX * upperLen;
                  const elbowY = shoulderY + perpY * upperLen;
                  // forearm hinges from elbow, sweeping from outward toward the node
                  const foreAngle = Math.atan2(towardY, towardX) + (1 - sweep) * (Math.PI * 0.7);
                  const tipX = elbowX + Math.cos(foreAngle) * foreLen;
                  const tipY = elbowY + Math.sin(foreAngle) * foreLen;
                  // pincher: two prongs angled inward (closing), gap closes as sweep increases
                  const clawOpen = (1 - sweep) * 5 + 1;
                  const clawAngle = foreAngle + Math.PI * 0.5;
                  const p1x = tipX + Math.cos(clawAngle + 0.5) * clawOpen;
                  const p1y = tipY + Math.sin(clawAngle + 0.5) * clawOpen;
                  const p2x = tipX + Math.cos(clawAngle - 0.5) * clawOpen;
                  const p2y = tipY + Math.sin(clawAngle - 0.5) * clawOpen;

                  return (
                    <>
                      <path
                        d={`M ${agent.x} ${agent.y + bob - 11} L ${agent.x + 15} ${agent.y + bob} L ${agent.x} ${agent.y + bob + 11} L ${agent.x - 15} ${agent.y + bob} Z`}
                        fill={bodyFill}
                        stroke={bodyStroke}
                        strokeWidth="2"
                      />
                      <circle cx={agent.x} cy={agent.y + bob} r="5" fill={dotColor} />
                      {/* speed streaks trailing opposite to movement */}
                      <line
                        x1={agent.x + perpX * 4}
                        y1={agent.y + bob + perpY * 4}
                        x2={agent.x + tailX * 20 + perpX * 4}
                        y2={agent.y + bob + tailY * 20 + perpY * 4}
                        stroke={dotColor}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        opacity="0.60"
                      />
                      <line
                        x1={agent.x - perpX * 4}
                        y1={agent.y + bob - perpY * 4}
                        x2={agent.x + tailX * 14 - perpX * 4}
                        y2={agent.y + bob + tailY * 14 - perpY * 4}
                        stroke={dotColor}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        opacity="0.35"
                      />
                      {/* jointed grabber arm */}
                      {agent.swing > 0 && (
                        <>
                          <line
                            x1={shoulderX}
                            y1={shoulderY}
                            x2={elbowX}
                            y2={elbowY}
                            stroke="rgba(160,235,255,0.80)"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                          <line
                            x1={elbowX}
                            y1={elbowY}
                            x2={tipX}
                            y2={tipY}
                            stroke="rgba(160,235,255,0.80)"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                          <line
                            x1={tipX}
                            y1={tipY}
                            x2={p1x}
                            y2={p1y}
                            stroke={dotColor}
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />
                          <line
                            x1={tipX}
                            y1={tipY}
                            x2={p2x}
                            y2={p2y}
                            stroke={dotColor}
                            strokeWidth="2.5"
                            strokeLinecap="round"
                          />
                        </>
                      )}
                    </>
                  );
                })()}

              {agent.kind === "drone" &&
                (() => {
                  const swingT = agent.swing / 24;
                  // tractor beam toward node
                  const tdx = agent.tx - agent.x;
                  const tdy = agent.ty - agent.y;
                  const td = Math.hypot(tdx, tdy) || 1;
                  const beamDirX = tdx / td;
                  const beamDirY = tdy / td;
                  const beamLen = agent.swing > 0 ? 18 + Math.sin(swingT * Math.PI * 4) * 4 : 0;
                  const beamOpacity = agent.swing > 0 ? 0.25 + Math.sin(swingT * Math.PI * 2) * 0.15 : 0;
                  // particle rides up the beam toward drone
                  const particleT = 1 - (swingT % 0.5) * 2; // 1→0 twice per cycle
                  const particleX = agent.x + beamDirX * beamLen * particleT;
                  const particleY = agent.y + bob + beamDirY * beamLen * particleT;
                  // orbit ring rotation from swing
                  const orbitAngle = (agent.swing / 24) * Math.PI * 2;

                  return (
                    <>
                      {/* tractor beam */}
                      {agent.swing > 0 && (
                        <>
                          <line
                            x1={agent.x}
                            y1={agent.y + bob}
                            x2={agent.x + beamDirX * beamLen}
                            y2={agent.y + bob + beamDirY * beamLen}
                            stroke={dotColor}
                            strokeWidth="3"
                            strokeLinecap="round"
                            opacity={beamOpacity}
                          />
                          <circle cx={particleX} cy={particleY} r="2.5" fill={dotColor} opacity="0.85" />
                        </>
                      )}
                      <circle
                        cx={agent.x}
                        cy={agent.y + bob}
                        r="13"
                        fill={bodyFill}
                        stroke={bodyStroke}
                        strokeWidth="2"
                      />
                      {/* rotating orbit ring */}
                      <ellipse
                        cx={agent.x}
                        cy={agent.y + bob}
                        rx="19"
                        ry="5"
                        fill="none"
                        stroke={dotColor}
                        strokeWidth="1.2"
                        opacity="0.55"
                        transform={`rotate(${(orbitAngle * 180) / Math.PI}, ${agent.x}, ${agent.y + bob})`}
                      />
                      <circle cx={agent.x} cy={agent.y + bob} r="5" fill={dotColor} />
                    </>
                  );
                })()}
            </g>
          );
        })}

      {clickPulse &&
        (() => {
          // 4.0 — tick-driven click-acknowledge ring. Fully faded rings render
          // nothing. Under lowFxMode we draw a single static ring instead of the
          // expanding animation (simplify, don't remove) per §Coarse-Pointer FX.
          const DURATION = 16;
          const age = elapsedTicks(game.timers.tick, clickPulse.startTick);
          if (age < 0 || age > DURATION) return null;
          const t = age / DURATION;
          if (reduceFx) {
            return (
              <circle
                cx={clickPulse.x}
                cy={clickPulse.y}
                r={26}
                fill="none"
                stroke="rgba(127,222,255,0.5)"
                strokeWidth="2"
                opacity={0.55 * (1 - t)}
                style={{ pointerEvents: "none" }}
              />
            );
          }
          return (
            <circle
              cx={clickPulse.x}
              cy={clickPulse.y}
              r={12 + t * 30}
              fill="none"
              stroke="rgba(127,222,255,0.9)"
              strokeWidth={0.5 + 2.5 * (1 - t)}
              opacity={0.85 * (1 - t)}
              style={{ pointerEvents: "none" }}
            />
          );
        })()}
    </svg>
  );
}

/**
 * 3.1.0 — memoized export. FieldSvg re-renders every tick with new game/derived
 * props by design, but memo still pays off when App.tsx re-renders for reasons
 * unrelated to the sim frame (e.g. toggling a modal, hover state on a sidebar
 * button). The `interactions` prop in App.tsx is now a useMemo'd handler bundle
 * so identity stays stable across those renders.
 */
export const FieldSvg = memo(FieldSvgInner);
FieldSvg.displayName = "FieldSvg";
