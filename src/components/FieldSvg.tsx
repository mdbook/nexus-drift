import { useMemo, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { WORLD_H, WORLD_W } from "@/game/constants";
import { SENTINEL } from "@/game/balance";
import { AGENT_STYLE, ENEMY_STYLE, NODE_STYLE } from "@/game/data";
import type { DerivedState, GameState } from "@/game/types";
import { isCloaked } from "@/game/enemyUtils";
import { useLowFxMode } from "@/hooks/useLowFxMode";
import { clamp } from "@/game/utils";

const SPAWN_FADE_TICKS = 20;
const DEATH_FADE_TICKS = 18;
const DESPAWN_WARN_TICKS = 60; // start fading out temporary nodes this many ticks before despawn

/** 0→1 fade-in alpha based on how long since spawnTick. */
function spawnAlpha(currentTick: number, spawnTick: number): number {
  if (spawnTick === 0) return 1; // initial game load — no fade
  return clamp((currentTick - spawnTick) / SPAWN_FADE_TICKS, 0, 1);
}

/** 1→0 fade-out alpha for enemies in their death animation. */
function deathAlpha(dyingTicks: number): number {
  return clamp(dyingTicks / DEATH_FADE_TICKS, 0, 1);
}

/** 1→0 fade-out alpha for temporary nodes approaching despawn. */
function despawnAlpha(currentTick: number, despawnAt: number): number {
  const remaining = despawnAt - currentTick;
  if (remaining > DESPAWN_WARN_TICKS) return 1;
  return clamp(remaining / DESPAWN_WARN_TICKS, 0, 1);
}

type FieldInteractionHandlers = {
  onTouristClick?: () => void;
  onLostDroneClick?: () => void;
  onAnomalyClick?: () => void;
  onProjectileClick?: (projectileId: number) => void;
  onEnemyClick?: (enemyId: number) => void;
};

type FieldSvgProps = {
  game: GameState;
  derived: DerivedState;
  interactions?: FieldInteractionHandlers;
};

const CITY_PALETTE = [
  { stroke: "rgba(127, 222, 255, 0.82)", fill: "rgba(114, 198, 255, 0.2)", accent: "rgba(220, 248, 255, 0.92)" },
  { stroke: "rgba(153, 238, 255, 0.82)", fill: "rgba(121, 222, 255, 0.22)", accent: "rgba(228, 252, 255, 0.94)" },
  { stroke: "rgba(99, 204, 255, 0.82)", fill: "rgba(80, 170, 245, 0.22)", accent: "rgba(197, 237, 255, 0.92)" },
  { stroke: "rgba(140, 255, 204, 0.8)", fill: "rgba(90, 226, 185, 0.22)", accent: "rgba(220, 255, 240, 0.94)" },
  { stroke: "rgba(105, 212, 255, 0.82)", fill: "rgba(80, 188, 255, 0.2)", accent: "rgba(210, 245, 255, 0.92)" },
  { stroke: "rgba(152, 235, 255, 0.8)", fill: "rgba(118, 215, 255, 0.22)", accent: "rgba(226, 249, 255, 0.94)" },
  { stroke: "rgba(151, 255, 195, 0.8)", fill: "rgba(114, 232, 165, 0.22)", accent: "rgba(224, 255, 234, 0.94)" },
  { stroke: "rgba(102, 220, 255, 0.82)", fill: "rgba(84, 194, 245, 0.22)", accent: "rgba(206, 242, 255, 0.92)" },
  { stroke: "rgba(170, 246, 255, 0.82)", fill: "rgba(138, 226, 255, 0.22)", accent: "rgba(232, 251, 255, 0.94)" },
  { stroke: "rgba(130, 255, 212, 0.8)", fill: "rgba(102, 228, 190, 0.22)", accent: "rgba(225, 255, 241, 0.92)" },
  { stroke: "rgba(110, 208, 255, 0.82)", fill: "rgba(76, 182, 245, 0.22)", accent: "rgba(205, 240, 255, 0.92)" },
  { stroke: "rgba(191, 247, 255, 0.84)", fill: "rgba(146, 229, 255, 0.22)", accent: "rgba(239, 252, 255, 0.95)" },
  { stroke: "rgba(144, 255, 198, 0.82)", fill: "rgba(100, 232, 176, 0.22)", accent: "rgba(228, 255, 238, 0.94)" },
  { stroke: "rgba(255, 213, 143, 0.8)", fill: "rgba(248, 186, 108, 0.2)", accent: "rgba(255, 244, 214, 0.94)" },
  { stroke: "rgba(255, 189, 174, 0.78)", fill: "rgba(246, 155, 138, 0.2)", accent: "rgba(255, 236, 230, 0.94)" },
  { stroke: "rgba(255, 168, 211, 0.76)", fill: "rgba(240, 130, 183, 0.18)", accent: "rgba(255, 230, 244, 0.92)" },
  { stroke: "rgba(215, 176, 255, 0.8)", fill: "rgba(176, 130, 242, 0.2)", accent: "rgba(241, 228, 255, 0.94)" },
  { stroke: "rgba(178, 190, 255, 0.8)", fill: "rgba(136, 146, 242, 0.2)", accent: "rgba(229, 233, 255, 0.94)" },
  { stroke: "rgba(177, 255, 233, 0.8)", fill: "rgba(126, 232, 215, 0.2)", accent: "rgba(232, 255, 247, 0.94)" },
  { stroke: "rgba(245, 228, 176, 0.78)", fill: "rgba(220, 197, 122, 0.2)", accent: "rgba(255, 249, 226, 0.94)" },
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
  paletteDrift: number;
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
          Math.max(1, Math.floor(seededNoise(seed, index + localIndex + 90) * CITY_MAX_STAGE) + 1 - Math.floor(heightBias))
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
        sidecarWidth: seededNoise(seed, index + 240) > 0.56 ? 4 + Math.floor(seededNoise(seed, index + 241) * 9) : 0,
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
        sidecarWidth: seededNoise(seed, index + 240) > 0.56 ? 4 + Math.floor(seededNoise(seed, index + 241) * 9) : 0,
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

function renderHomeDistrict(game: GameState, district: DistrictRenderData | null, dayFactor: number) {
  if (!district) return null;

  const {
    progress,
    stage,
    buildProgress,
    chromatic,
    paletteDrift,
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
        const laneOffset =
          Math.abs(rawOffset) < 42 ? (rawOffset < 0 ? -42 : 42) : rawOffset;
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
            <line x1={x} y1="552" x2={x} y2={y + 8} stroke={palette.stroke} strokeWidth="1.5" opacity={0.45} />
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
                      opacity={(0.4 + ((columnIndex + lightIndex) % 3) * 0.08) * revealProgress * (0.15 + dayFactor * 0.85)}
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
              const bx = building.x + 4 + ((building.width - 8) * beaconIndex) / Math.max(1, building.beaconCount - 1);
              const by = crownY - 6 - beaconIndex * 2;
              return <circle key={`beacon-${index}-${beaconIndex}`} cx={bx} cy={by} r="1.3" fill={palette.accent} opacity={0.88} />;
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

export function FieldSvg({ game, derived, interactions }: FieldSvgProps) {
  const lowFxMode = useLowFxMode();
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
    const paletteDrift = chromatic ? game.timers.tick * 0.0045 : 0;
    const sequentialCursor = buildProgress * districtBuildings.length;
    const fullyBuiltCount = Math.floor(sequentialCursor);
    const activeBuildIndex = Math.min(districtBuildings.length - 1, fullyBuiltCount);

    return {
      progress,
      stage,
      buildProgress,
      chromatic,
      paletteDrift,
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
  }, [
    activeTurretXs,
    derived.cityBuildProgress,
    derived.cityProgress,
    derived.cityStage,
    districtBuildings,
    game.citySeed,
    game.timers.tick,
  ]);
  const dayCycleMs = 30 * 60 * 1000;
  const dayPhase = (game.stats.runtimeMs % dayCycleMs) / dayCycleMs;
  const dayFactor = Math.sin(dayPhase * Math.PI * 2) * 0.5 + 0.5;
  const skyLight = Math.round(dayFactor * 18);
  const skyColor = `rgb(${skyLight}, ${skyLight + 4}, ${skyLight + 10})`;
  const nightOverlayOpacity = dayFactor < 0.5 ? 1 - dayFactor * 2 : 0;
  const touristInteractive = Boolean(interactions?.onTouristClick) && Boolean(game.touristWorker?.active);
  const lostDroneInteractive = Boolean(interactions?.onLostDroneClick) && Boolean(game.lostDrone);
  const anomalyInteractive =
    Boolean(interactions?.onAnomalyClick) &&
    game.activeEvents.length >= 3 &&
    !game.achievements.event_streak;

  const onSvgActivate = (event: ReactKeyboardEvent<SVGElement>, handler?: () => void) => {
    if (!handler) return;
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    handler();
  };

  return (
    <svg
      viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
      className="h-full min-h-[380px] w-full bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]"
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

      <path
        d="M118 538 H882"
        fill="none"
        stroke="rgba(120, 215, 255, 0.12)"
        strokeWidth="1"
      />

      {nightOverlayOpacity > 0 && (
        <rect
          width={WORLD_W}
          height={WORLD_H}
          fill="rgba(15, 20, 60, 0.4)"
          opacity={nightOverlayOpacity}
          style={{ pointerEvents: "none" }}
        />
      )}

      {renderHomeDistrict(game, district, dayFactor)}

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
              <circle cx={turret.x} cy={turret.y} r="6" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" />
            </g>
          );
        }

        const turretDisabled = turret.disabledTicks > 0;
        const disablePulse = 0.3 + Math.sin(game.timers.tick / 5) * 0.2;
        return (
          <g key={turret.id} style={turretDisabled ? { filter: "grayscale(1)" } : undefined}>
            <circle cx={turret.x} cy={turret.y} r={turret.range} fill="none" stroke="rgba(80,200,255,0.07)" strokeDasharray="7 9" />
            {turretDisabled && (
              <circle cx={turret.x} cy={turret.y} r="26" fill="none" stroke={`rgba(255,120,40,${disablePulse.toFixed(2)})`} strokeWidth="2.5" />
            )}
            <circle cx={turret.x} cy={turret.y} r="22" fill="rgba(80,200,255,0.10)" />
            <circle cx={turret.x} cy={turret.y} r="14" fill="rgba(40,120,200,0.55)" stroke="rgba(120,220,255,0.75)" strokeWidth="2" />
            <line
              x1={turret.x}
              y1={turret.y}
              x2={turret.x + Math.cos(turret.angle) * 21}
              y2={turret.y + Math.sin(turret.angle) * 21}
              stroke="rgba(160,235,255,0.95)"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
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
        const nodeAlpha = node.temporary && node.despawnAt !== undefined
          ? Math.min(spawnAlpha(game.timers.tick, node.spawnTick), despawnAlpha(game.timers.tick, node.despawnAt))
          : spawnAlpha(game.timers.tick, node.spawnTick);

        return (
          <g key={node.id} opacity={nodeAlpha}>
            {node.corruption > 0 && (
              <>
                <circle cx={node.x} cy={node.y} r={node.size + 22} fill="rgba(160,50,255,0.22)" opacity={toxicGlow * 1.4} />
                <circle cx={node.x} cy={node.y} r={node.size + 8} fill="none" stroke={`rgba(200,80,255,${(toxicGlow * 1.8).toFixed(2)})`} strokeWidth="1.5" />
              </>
            )}
            <circle
              cx={node.x}
              cy={node.y}
              r={node.size + 16}
              fill="url(#fieldGlow)"
              opacity={0.18 + (Math.sin(node.pulse) + 1) * 0.08}
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
            <rect x={hpBarX} y={hpBarY} rx="4" ry="4" width={hpBarWidth} height="5" fill="rgba(255,255,255,0.12)" />
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
            <rect x={hpBarX} y={hpBarY} rx="4" ry="4" width={hpWidth} height="5" fill="rgba(255,255,255,0.7)" />
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
                <rect x={node.x - 22} y={node.y + node.size + 18} rx="4" ry="4" width="44" height="4" fill="rgba(255,255,255,0.08)" />
                <rect x={node.x - 22} y={node.y + node.size + 18} rx="4" ry="4" width={(44 * corruptionPct) / 100} height="4" fill="rgba(195,120,255,0.92)" />
              </>
            )}
            {!lowFxMode && (
              <text x={node.x} y={node.y + 4} textAnchor="middle" fontSize="10" fill="rgba(0,0,0,1)" fontWeight="bold" style={{ letterSpacing: 1.5 }} filter="url(#textBlur)">
                {node.kind.toUpperCase()}
              </text>
            )}
            <text x={node.x} y={node.y + 4} textAnchor="middle" fontSize="10" fill={style.label} fontWeight="bold" style={{ letterSpacing: 1.5 }}>
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
              onClick={missileInteractive ? () => interactions?.onProjectileClick?.(projectile.id) : undefined}
              onKeyDown={missileInteractive ? (event) => onSvgActivate(event, () => interactions?.onProjectileClick?.(projectile.id)) : undefined}
              style={missileInteractive ? { cursor: "pointer" } : undefined}
            >
              {missileInteractive && <rect x={-5.5} y={-5} width="11.5" height="10" fill="rgba(0,0,0,0.001)" />}
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
                onKeyDown={(event) => onSvgActivate(event, () => interactions.onProjectileClick?.(projectile.id))}
                style={{ cursor: "pointer" }}
              />
            )}
          </g>
        );
      })}

      {game.goldExplosion && (() => {
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
            <circle cx={x} cy={y} r={r1} fill="none" stroke={`rgba(255,200,0,${alpha * 0.8})`} strokeWidth={2.5} />
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
          <circle r="26" fill="rgba(167, 139, 250, 0.09)" stroke="rgba(196, 181, 253, 0.48)" strokeWidth="1.2" />
          <circle r="18" fill="rgba(109, 40, 217, 0.18)" stroke="rgba(233, 213, 255, 0.3)" strokeWidth="1" strokeDasharray="4 5" />
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
          onKeyDown={lostDroneInteractive ? (event) => onSvgActivate(event, interactions?.onLostDroneClick) : undefined}
          style={lostDroneInteractive ? { cursor: "pointer" } : undefined}
        >
          {lostDroneInteractive && <circle r="22" fill="rgba(0,0,0,0.001)" />}
          <ellipse rx="15" ry="11" fill="rgba(209, 213, 219, 0.12)" />
          <ellipse rx="10.5" ry="8.2" fill="rgba(148, 163, 184, 0.55)" stroke="rgba(229, 231, 235, 0.42)" strokeWidth="1" />
          <path d="M -7 -6 L 2 0 L -4 7" fill="none" stroke="rgba(31, 41, 55, 0.82)" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M 4 -7 L 8 -2 L 3 4" fill="none" stroke="rgba(55, 65, 81, 0.75)" strokeWidth="1.2" strokeLinecap="round" />
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
        const enemyFadeAlpha = enemy.hp <= 0
          ? deathAlpha(enemy.dyingTicks)
          : spawnAlpha(game.timers.tick, enemy.spawnTick);
        const corpseInteractive = Boolean(interactions?.onEnemyClick) && enemy.hp <= 0 && enemy.dyingTicks > 0;
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
          : {};

        if (enemy.role === "corruptor") {
          const wobble = Math.sin((game.timers.tick + enemy.id * 11) / 7) * 2;
          return (
            <g key={enemy.id} opacity={enemyFadeAlpha} {...enemyInteractiveProps}>
              {corpseInteractive && <circle cx={enemy.x} cy={enemy.y} r="24" fill="rgba(0,0,0,0.001)" />}
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
              <path d={`M ${enemy.x - 9} ${enemy.y + 9} q 7 10 18 4`} stroke="rgba(235,180,255,0.7)" strokeWidth="2" fill="none" />
              <rect x={enemy.x - 16} y={enemy.y + 18} rx="4" ry="4" width="32" height="4" fill="rgba(255,255,255,0.12)" />
              <rect x={enemy.x - 16} y={enemy.y + 18} rx="4" ry="4" width={(32 * hpPct) / 100} height="4" fill="rgba(210,140,255,0.95)" />
            </g>
          );
        }

        const style = ENEMY_STYLE[enemy.kind as Exclude<typeof enemy.kind, "corruptor">];
        const enemyOpacity = (isCloaked(enemy) ? 0.2 : 1) * enemyFadeAlpha;
        const threatPulse = 0.12 + Math.sin((game.timers.tick + enemy.id * 7) / 10) * 0.07;
        const threatRing = (
          <circle cx={enemy.x} cy={enemy.y} r={style.radius + 18} fill={`rgba(220,30,30,${threatPulse.toFixed(2)})`} stroke="rgba(255,60,60,0.45)" strokeWidth="1.2" opacity={enemyOpacity} />
        );

        // Shield overlay — rendered for any enemy that carries a shield layer
        // (leech, phantom, zapper). Draws a translucent arc ring around the
        // enemy whose opacity tracks shield fullness, plus a small shield bar
        // above the HP bar. Regenerating shields pulse subtly to telegraph that
        // damage was recently absorbed.
        const hasShield =
          enemy.shield !== undefined &&
          enemy.shieldMax !== undefined &&
          enemy.shieldMax > 0;
        const shieldPct = hasShield ? clamp((enemy.shield! / enemy.shieldMax!) * 100, 0, 100) : 0;
        const shieldRegenerating =
          hasShield &&
          enemy.shield! < enemy.shieldMax! &&
          (enemy.shieldRegenCooldown ?? 0) === 0;
        const shieldPulse = shieldRegenerating
          ? 0.55 + Math.sin((game.timers.tick + enemy.id * 9) / 6) * 0.25
          : 0.7;
        const shieldRing = hasShield && shieldPct > 0 ? (
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
        const shieldGlow = hasShield && shieldPct > 0 ? (
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
              y={enemy.y + style.radius + 14}
              rx="3"
              ry="3"
              width="32"
              height="3"
              fill="rgba(255,255,255,0.10)"
            />
            <rect
              x={enemy.x - 16}
              y={enemy.y + style.radius + 14}
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
              {corpseInteractive && <circle cx={enemy.x} cy={enemy.y} r={style.radius + 12} fill="rgba(0,0,0,0.001)" />}
              {threatRing}
              <circle cx={enemy.x} cy={enemy.y} r={style.radius + 14} fill={style.glow} />
              {/* thick outer armour ring */}
              <rect x={enemy.x - 20} y={enemy.y - 20} width="40" height="40" rx="5" fill="rgba(100,10,25,0.55)" stroke={style.stroke} strokeWidth="2.5" />
              {/* inner body */}
              <rect x={enemy.x - 14} y={enemy.y - 14} width="28" height="28" rx="3" fill={enemy.flash ? "rgba(255,255,255,0.82)" : style.fill} stroke="rgba(255,100,120,0.5)" strokeWidth="1" />
              {/* armour cross marks */}
              <line x1={enemy.x - 10} y1={enemy.y} x2={enemy.x + 10} y2={enemy.y} stroke="rgba(255,180,190,0.7)" strokeWidth="2" />
              <line x1={enemy.x} y1={enemy.y - 10} x2={enemy.x} y2={enemy.y + 10} stroke="rgba(255,180,190,0.7)" strokeWidth="2" />
              <rect x={enemy.x - 18} y={enemy.y + style.radius + 10} rx="4" ry="4" width="36" height="5" fill="rgba(255,255,255,0.12)" />
              <rect x={enemy.x - 18} y={enemy.y + style.radius + 10} rx="4" ry="4" width={(36 * hpPct) / 100} height="5" fill="rgba(255,100,130,0.95)" />
            </g>
          );
        }

        if (enemy.kind === "wisp") {
          return (
            <g key={enemy.id} opacity={enemyOpacity} {...enemyInteractiveProps}>
              {corpseInteractive && <circle cx={enemy.x} cy={enemy.y} r={style.radius + 12} fill="rgba(0,0,0,0.001)" />}
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
              <rect x={enemy.x - 16} y={enemy.y + style.radius + 8} rx="4" ry="4" width="32" height="4" fill="rgba(255,255,255,0.12)" />
              <rect x={enemy.x - 16} y={enemy.y + style.radius + 8} rx="4" ry="4" width={(32 * hpPct) / 100} height="4" fill="rgba(90,210,175,0.95)" />
            </g>
          );
        }

        if (enemy.kind === "zapper") {
          const arcPulse = Math.sin((game.timers.tick + enemy.id * 5) / 8) * 0.4 + 0.6;
          const charged = enemy.fireCooldown !== undefined && enemy.fireCooldown < 15;
          return (
            <g key={enemy.id} opacity={enemyOpacity} {...enemyInteractiveProps}>
              {corpseInteractive && <circle cx={enemy.x} cy={enemy.y} r={style.radius + 12} fill="rgba(0,0,0,0.001)" />}
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
              <line x1={enemy.x - 4} y1={enemy.y - 9} x2={enemy.x - 10} y2={enemy.y - 19} stroke="rgba(210,130,255,0.85)" strokeWidth="1.5" />
              <line x1={enemy.x + 4} y1={enemy.y - 9} x2={enemy.x + 10} y2={enemy.y - 19} stroke="rgba(210,130,255,0.85)" strokeWidth="1.5" />
              {/* charge orb at antenna tip — pulses brighter when ready to fire */}
              <circle cx={enemy.x - 10} cy={enemy.y - 19} r="2.5" fill={charged ? "rgba(230,160,255,0.98)" : `rgba(180,80,255,${arcPulse.toFixed(2)})`} />
              <circle cx={enemy.x + 10} cy={enemy.y - 19} r="2.5" fill={charged ? "rgba(230,160,255,0.98)" : `rgba(180,80,255,${arcPulse.toFixed(2)})`} />
              {shieldRing}
              <rect x={enemy.x - 16} y={enemy.y + style.radius + 8} rx="4" ry="4" width="32" height="4" fill="rgba(255,255,255,0.12)" />
              <rect x={enemy.x - 16} y={enemy.y + style.radius + 8} rx="4" ry="4" width={(32 * hpPct) / 100} height="4" fill="rgba(180,80,255,0.95)" />
              {shieldBar}
            </g>
          );
        }

        // mite — small fast circle with sharp antenna spikes
        if (enemy.kind === "sapper") {
          return (
            <g key={enemy.id} opacity={enemyOpacity} {...enemyInteractiveProps}>
              {corpseInteractive && <circle cx={enemy.x} cy={enemy.y} r={style.radius + 12} fill="rgba(0,0,0,0.001)" />}
              <circle cx={enemy.x} cy={enemy.y} r="60" fill="none" stroke="#f43f5e" strokeWidth="0.5" opacity="0.3" />
              {threatRing}
              <circle cx={enemy.x} cy={enemy.y} r={style.radius + 11} fill={style.glow} />
              <circle cx={enemy.x} cy={enemy.y} r={style.radius} fill={enemy.flash ? "rgba(255,255,255,0.82)" : style.fill} stroke={style.stroke} strokeWidth="1.5" />
              <line x1={enemy.x} y1={enemy.y - 10} x2={enemy.x} y2={enemy.y + 10} stroke="rgba(255,230,230,0.8)" strokeWidth="1.5" />
              <line x1={enemy.x - 10} y1={enemy.y} x2={enemy.x + 10} y2={enemy.y} stroke="rgba(255,230,230,0.8)" strokeWidth="1.5" />
            </g>
          );
        }

        return (
          <g key={enemy.id} opacity={enemyOpacity} {...enemyInteractiveProps}>
            {corpseInteractive && <circle cx={enemy.x} cy={enemy.y} r={style.radius + 12} fill="rgba(0,0,0,0.001)" />}
            {threatRing}
            {shieldGlow}
            <circle cx={enemy.x} cy={enemy.y} r={style.radius + 11} fill={style.glow} />
            <circle cx={enemy.x} cy={enemy.y} r={style.radius} fill={enemy.flash ? "rgba(255,255,255,0.82)" : style.fill} stroke={style.stroke} strokeWidth="1.5" />
            {/* sharp antenna spikes */}
            <line x1={enemy.x - 5} y1={enemy.y - 7} x2={enemy.x - 10} y2={enemy.y - 16} stroke="rgba(255,200,100,0.75)" strokeWidth="1.5" />
            <line x1={enemy.x + 5} y1={enemy.y - 7} x2={enemy.x + 10} y2={enemy.y - 16} stroke="rgba(255,200,100,0.75)" strokeWidth="1.5" />
            <circle cx={enemy.x - 10} cy={enemy.y - 16} r="1.5" fill="rgba(255,230,160,0.9)" />
            <circle cx={enemy.x + 10} cy={enemy.y - 16} r="1.5" fill="rgba(255,230,160,0.9)" />
            {shieldRing}
            <rect x={enemy.x - 16} y={enemy.y + style.radius + 8} rx="4" ry="4" width="32" height="4" fill="rgba(255,255,255,0.12)" />
            <rect x={enemy.x - 16} y={enemy.y + style.radius + 8} rx="4" ry="4" width={(32 * hpPct) / 100} height="4" fill="rgba(255,165,60,0.95)" />
            {shieldBar}
          </g>
        );
      })}

      {game.scouts.map((scout, index) => {
        const live = index < derived.activeScouts;
        const bob = Math.sin(scout.pulse) * 2.2;

        if (!live) return null;

        return (
          <g key={scout.id}>
            <line x1={scout.x} y1={scout.y} x2={scout.tx} y2={scout.ty} stroke="rgba(80,200,255,0.12)" strokeDasharray="4 4" />
            <circle cx={scout.x} cy={scout.y + bob} r="16" fill="rgba(80,200,255,0.10)" stroke="rgba(120,220,255,0.42)" strokeWidth="1.1" />
            <path
              d={`M ${scout.x} ${scout.y + bob - 8} L ${scout.x + 5.5} ${scout.y + bob + 1.5} L ${scout.x} ${scout.y + bob + 8} L ${scout.x - 5.5} ${scout.y + bob + 1.5} Z`}
              fill="rgba(160,235,255,0.86)"
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
              stroke="rgba(120,220,255,0.90)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {game.sentinels.map((sentinel, index) => {
        const live = index < derived.activeSentinels;
        if (!live) return null;

        const pulse = Math.sin(sentinel.pulse) * 0.15 + 0.85;
        const size = 9;
        const points = [
          `${sentinel.x},${sentinel.y - size}`,
          `${sentinel.x + size * 0.7},${sentinel.y}`,
          `${sentinel.x},${sentinel.y + size}`,
          `${sentinel.x - size * 0.7},${sentinel.y}`,
        ].join(" ");

        return (
          <g
            key={sentinel.id}
            transform={`rotate(${(sentinel.angle * 180) / Math.PI + 90}, ${sentinel.x}, ${sentinel.y})`}
          >
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
              fill="#fbbf24"
              opacity={pulse}
              stroke="#f59e0b"
              strokeWidth="1.5"
            />
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
          onKeyDown={touristInteractive ? (event) => onSvgActivate(event, interactions?.onTouristClick) : undefined}
          style={touristInteractive ? { cursor: "pointer", outline: "none" } : undefined}
        >
          {/* Transparent hit area so the tiny tourist is still reasonably clickable. */}
          {touristInteractive && <circle r="16" fill="rgba(0,0,0,0.001)" />}
          <circle r="8" fill="rgba(253, 230, 138, 0.16)" />
          <circle r="5" fill="#fde68a" stroke="#f59e0b" strokeWidth="1" />
          <rect x="5" y="-3" width="6" height="4" rx="1" fill="#374151" />
          <circle cx="8" cy="-1" r="1.5" fill={game.touristWorker.squishTicks > 0 ? "#93c5fd" : "#60a5fa"} />
        </g>
      )}

      {game.agents.filter((agent) => agent.active).map((agent) => {
        const bob = Math.sin((game.timers.tick + agent.id * 8) / 7) * 2;
        const shieldActive = game.upgrades.shield > 0;
        const panicOpacity = clamp(agent.panic / 100, 0, 1) * 0.22;
        const dotColor = AGENT_STYLE[agent.kind];
        const damaged = agent.hp < 35;
        const bodyFill = damaged ? "rgba(255,130,130,0.32)" : "rgba(40,110,180,0.50)";
        const bodyStroke = damaged ? "rgba(255,150,150,0.75)" : "rgba(120,220,255,0.80)";
        const agentAlpha = spawnAlpha(game.timers.tick, agent.spawnTick);
        const agentDisabled = agent.disabledTicks > 0;
        const agentDisablePulse = 0.3 + Math.sin(game.timers.tick / 5) * 0.2;

        // hexagon points helper
        const hex = (cx: number, cy: number, r: number) =>
          Array.from({ length: 6 }, (_, i) => {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
          }).join(" ");

        return (
          <g key={agent.id} opacity={agentAlpha} style={agentDisabled ? { filter: "grayscale(1)" } : undefined}>
            {agentDisabled && (
              <circle cx={agent.x} cy={agent.y + bob} r="26" fill="none" stroke={`rgba(255,120,40,${agentDisablePulse.toFixed(2)})`} strokeWidth="2.5" />
            )}
            <line x1={agent.x} y1={agent.y} x2={agent.tx} y2={agent.ty} stroke="rgba(255,255,255,0.09)" strokeDasharray="4 5" />
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
              <circle cx={agent.x} cy={agent.y + bob} r={20 + agent.panic * 0.04} fill={`rgba(255, 120, 120, ${panicOpacity})`} />
            )}
            {shieldActive && (
              <circle cx={agent.x} cy={agent.y + bob} r={19 + game.upgrades.shield * 1.5} fill="none" stroke="rgba(150,220,255,0.22)" strokeWidth="2" />
            )}
            <circle cx={agent.x} cy={agent.y + bob} r="22" fill="rgba(80,200,255,0.08)" stroke="rgba(80,200,255,0.18)" strokeWidth="1" />

            {agent.kind === "miner" && (() => {
              // swing goes 0-23; map to raise→strike arc
              const swingT = agent.swing / 24;
              // eased: slow raise, fast strike — peak at t=0.45
              const swingProgress = Math.pow(Math.max(0, Math.sin(swingT * Math.PI)), 0.55);
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
              const isStriking = agent.swing > 0 && swingProgress > 0.88;
              return (
                // hexagon — sturdy, industrial
                <>
                  <polygon points={hex(agent.x, agent.y + bob, 13)} fill={bodyFill} stroke={bodyStroke} strokeWidth="2" />
                  <circle cx={agent.x} cy={agent.y + bob} r="5" fill={dotColor} />
                  {agent.swing > 0 && (
                    <>
                      {/* arm */}
                      <line x1={shoulderX} y1={shoulderY} x2={tipX} y2={tipY} stroke="rgba(160,235,255,0.90)" strokeWidth="2.5" strokeLinecap="round" />
                      {/* pickaxe head */}
                      <line x1={h1x} y1={h1y} x2={h2x} y2={h2y} stroke={dotColor} strokeWidth="3" strokeLinecap="round" />
                      {/* impact spark at strike */}
                      {isStriking && (
                        <circle cx={tipX} cy={tipY} r="4" fill="none" stroke={dotColor} strokeWidth="1.2" opacity="0.85" />
                      )}
                    </>
                  )}
                </>
              );
            })()}

            {agent.kind === "runner" && (() => {
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
                    fill={bodyFill} stroke={bodyStroke} strokeWidth="2"
                  />
                  <circle cx={agent.x} cy={agent.y + bob} r="5" fill={dotColor} />
                  {/* speed streaks trailing opposite to movement */}
                  <line
                    x1={agent.x + perpX * 4} y1={agent.y + bob + perpY * 4}
                    x2={agent.x + tailX * 20 + perpX * 4} y2={agent.y + bob + tailY * 20 + perpY * 4}
                    stroke={dotColor} strokeWidth="1.5" strokeLinecap="round" opacity="0.60"
                  />
                  <line
                    x1={agent.x - perpX * 4} y1={agent.y + bob - perpY * 4}
                    x2={agent.x + tailX * 14 - perpX * 4} y2={agent.y + bob + tailY * 14 - perpY * 4}
                    stroke={dotColor} strokeWidth="1.5" strokeLinecap="round" opacity="0.35"
                  />
                  {/* jointed grabber arm */}
                  {agent.swing > 0 && (
                    <>
                      <line x1={shoulderX} y1={shoulderY} x2={elbowX} y2={elbowY} stroke="rgba(160,235,255,0.80)" strokeWidth="2" strokeLinecap="round" />
                      <line x1={elbowX} y1={elbowY} x2={tipX} y2={tipY} stroke="rgba(160,235,255,0.80)" strokeWidth="2" strokeLinecap="round" />
                      <line x1={tipX} y1={tipY} x2={p1x} y2={p1y} stroke={dotColor} strokeWidth="2.5" strokeLinecap="round" />
                      <line x1={tipX} y1={tipY} x2={p2x} y2={p2y} stroke={dotColor} strokeWidth="2.5" strokeLinecap="round" />
                    </>
                  )}
                </>
              );
            })()}

            {agent.kind === "drone" && (() => {
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
                        x1={agent.x} y1={agent.y + bob}
                        x2={agent.x + beamDirX * beamLen} y2={agent.y + bob + beamDirY * beamLen}
                        stroke={dotColor} strokeWidth="3" strokeLinecap="round"
                        opacity={beamOpacity}
                      />
                      <circle cx={particleX} cy={particleY} r="2.5" fill={dotColor} opacity="0.85" />
                    </>
                  )}
                  <circle cx={agent.x} cy={agent.y + bob} r="13" fill={bodyFill} stroke={bodyStroke} strokeWidth="2" />
                  {/* rotating orbit ring */}
                  <ellipse
                    cx={agent.x} cy={agent.y + bob} rx="19" ry="5"
                    fill="none" stroke={dotColor} strokeWidth="1.2" opacity="0.55"
                    transform={`rotate(${(orbitAngle * 180) / Math.PI}, ${agent.x}, ${agent.y + bob})`}
                  />
                  <circle cx={agent.x} cy={agent.y + bob} r="5" fill={dotColor} />
                </>
              );
            })()}
          </g>
        );
      })}
    </svg>
  );
}
