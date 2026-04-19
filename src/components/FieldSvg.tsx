import { WORLD_H, WORLD_W } from "@/game/constants";
import { AGENT_STYLE, ENEMY_STYLE, NODE_STYLE } from "@/game/data";
import type { DerivedState, GameState } from "@/game/types";
import { clamp } from "@/game/utils";

type FieldSvgProps = {
  game: GameState;
  derived: DerivedState;
};

export function FieldSvg({ game, derived }: FieldSvgProps) {
  return (
    <svg
      viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
      className="h-[60vh] min-h-[440px] w-full bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]"
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
      </defs>

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
        stroke="rgba(255,255,255,0.1)"
      />

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

        return (
          <g key={turret.id}>
            <circle cx={turret.x} cy={turret.y} r={turret.range} fill="none" stroke="rgba(255,255,255,0.05)" strokeDasharray="7 9" />
            <circle cx={turret.x} cy={turret.y} r="20" fill="rgba(255,255,255,0.06)" />
            <circle cx={turret.x} cy={turret.y} r="14" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.42)" strokeWidth="1.5" />
            <line
              x1={turret.x}
              y1={turret.y}
              x2={turret.x + Math.cos(turret.angle) * 21}
              y2={turret.y + Math.sin(turret.angle) * 21}
              stroke="rgba(255,255,255,0.92)"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {game.nodes.map((node) => {
        const style = NODE_STYLE[node.kind];
        const hpPct = clamp((node.hp / node.maxHp) * 100, 0, 100);
        const corruptionPct = clamp(node.corruption, 0, 100);
        const toxicGlow = node.corruption > 0 ? 0.1 + node.corruption / 200 : 0;

        return (
          <g key={node.id}>
            {node.corruption > 0 && (
              <circle cx={node.x} cy={node.y} r={node.size + 20} fill="rgba(190,80,255,0.16)" opacity={toxicGlow} />
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
            <rect x={node.x - 22} y={node.y + node.size + 10} rx="4" ry="4" width="44" height="5" fill="rgba(255,255,255,0.12)" />
            <rect x={node.x - 22} y={node.y + node.size + 10} rx="4" ry="4" width={(44 * hpPct) / 100} height="5" fill="rgba(255,255,255,0.7)" />
            {node.corruption > 0 && (
              <>
                <rect x={node.x - 22} y={node.y + node.size + 18} rx="4" ry="4" width="44" height="4" fill="rgba(255,255,255,0.08)" />
                <rect x={node.x - 22} y={node.y + node.size + 18} rx="4" ry="4" width={(44 * corruptionPct) / 100} height="4" fill="rgba(195,120,255,0.92)" />
              </>
            )}
            <text x={node.x} y={node.y + 4} textAnchor="middle" fontSize="10" fill={style.label} style={{ letterSpacing: 1.5 }}>
              {node.kind.toUpperCase()}
            </text>
          </g>
        );
      })}

      {game.projectiles.map((projectile) => (
        <line
          key={projectile.id}
          x1={projectile.x1}
          y1={projectile.y1}
          x2={projectile.x2}
          y2={projectile.y2}
          stroke={projectile.color}
          strokeWidth={projectile.width}
          opacity={projectile.life / projectile.maxLife}
          strokeLinecap="round"
        />
      ))}

      {game.enemies.map((enemy) => {
        const hpPct = clamp((enemy.hp / enemy.maxHp) * 100, 0, 100);

        if (enemy.role === "corruptor") {
          const wobble = Math.sin((game.timers.tick + enemy.id * 11) / 7) * 2;
          return (
            <g key={enemy.id}>
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
        if (enemy.kind === "raider") {
          return (
            <g key={enemy.id}>
              <circle cx={enemy.x} cy={enemy.y} r={style.radius + 11} fill={style.glow} />
              <rect x={enemy.x - 12} y={enemy.y - 12} width="24" height="24" rx="6" fill={enemy.flash ? "rgba(255,255,255,0.82)" : style.fill} stroke={style.stroke} strokeWidth="1.2" />
              <line x1={enemy.x - 8} y1={enemy.y} x2={enemy.x + 8} y2={enemy.y} stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
              <rect x={enemy.x - 16} y={enemy.y + style.radius + 8} rx="4" ry="4" width="32" height="4" fill="rgba(255,255,255,0.12)" />
              <rect x={enemy.x - 16} y={enemy.y + style.radius + 8} rx="4" ry="4" width={(32 * hpPct) / 100} height="4" fill="rgba(255,140,140,0.95)" />
            </g>
          );
        }

        if (enemy.kind === "wisp") {
          return (
            <g key={enemy.id}>
              <circle cx={enemy.x} cy={enemy.y} r={style.radius + 11} fill={style.glow} />
              <path
                d={`M ${enemy.x} ${enemy.y - 12} L ${enemy.x + 10} ${enemy.y} L ${enemy.x} ${enemy.y + 12} L ${enemy.x - 10} ${enemy.y} Z`}
                fill={enemy.flash ? "rgba(255,255,255,0.82)" : style.fill}
                stroke={style.stroke}
                strokeWidth="1.2"
              />
              <rect x={enemy.x - 16} y={enemy.y + style.radius + 8} rx="4" ry="4" width="32" height="4" fill="rgba(255,255,255,0.12)" />
              <rect x={enemy.x - 16} y={enemy.y + style.radius + 8} rx="4" ry="4" width={(32 * hpPct) / 100} height="4" fill="rgba(152,220,255,0.95)" />
            </g>
          );
        }

        return (
          <g key={enemy.id}>
            <circle cx={enemy.x} cy={enemy.y} r={style.radius + 11} fill={style.glow} />
            <circle cx={enemy.x} cy={enemy.y} r={style.radius} fill={enemy.flash ? "rgba(255,255,255,0.82)" : style.fill} stroke={style.stroke} strokeWidth="1.2" />
            <line x1={enemy.x - 6} y1={enemy.y - 8} x2={enemy.x - 11} y2={enemy.y - 14} stroke="rgba(255,255,255,0.4)" />
            <line x1={enemy.x + 6} y1={enemy.y - 8} x2={enemy.x + 11} y2={enemy.y - 14} stroke="rgba(255,255,255,0.4)" />
            <rect x={enemy.x - 16} y={enemy.y + style.radius + 8} rx="4" ry="4" width="32" height="4" fill="rgba(255,255,255,0.12)" />
            <rect x={enemy.x - 16} y={enemy.y + style.radius + 8} rx="4" ry="4" width={(32 * hpPct) / 100} height="4" fill="rgba(255,176,145,0.95)" />
          </g>
        );
      })}

      {game.scouts.map((scout, index) => {
        const live = index < derived.activeScouts;
        const bob = Math.sin(scout.pulse) * 2.2;

        if (!live) return null;

        return (
          <g key={scout.id}>
            <line x1={scout.x} y1={scout.y} x2={scout.tx} y2={scout.ty} stroke="rgba(220,180,255,0.12)" strokeDasharray="4 4" />
            <circle cx={scout.x} cy={scout.y + bob} r="16" fill="rgba(205,155,255,0.14)" stroke="rgba(240,210,255,0.55)" strokeWidth="1.3" />
            <path
              d={`M ${scout.x - 8} ${scout.y + bob + 4} L ${scout.x} ${scout.y + bob - 10} L ${scout.x + 8} ${scout.y + bob + 4} Z`}
              fill="rgba(245,220,255,0.95)"
              opacity="0.92"
            />
            <line
              x1={scout.x}
              y1={scout.y + bob}
              x2={scout.x + Math.cos(scout.angle) * 18}
              y2={scout.y + bob + Math.sin(scout.angle) * 18}
              stroke="rgba(220,180,255,0.82)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {game.agents.map((agent) => {
        const bob = Math.sin((game.timers.tick + agent.id * 8) / 7) * 2;
        const shieldActive = game.upgrades.shield > 0;
        const panicOpacity = clamp(agent.panic / 100, 0, 1) * 0.22;
        const armAngle = (agent.swing / 24) * Math.PI * 2;
        const armX = agent.x + 8 + Math.cos(armAngle) * 5;
        const armY = agent.y + bob - 7 + Math.sin(armAngle) * 5;

        return (
          <g key={agent.id}>
            <line x1={agent.x} y1={agent.y} x2={agent.tx} y2={agent.ty} stroke="rgba(255,255,255,0.09)" strokeDasharray="4 5" />
            {panicOpacity > 0 && (
              <circle cx={agent.x} cy={agent.y + bob} r={20 + agent.panic * 0.04} fill={`rgba(255, 120, 120, ${panicOpacity})`} />
            )}
            {shieldActive && (
              <circle cx={agent.x} cy={agent.y + bob} r={19 + game.upgrades.shield * 1.5} fill="none" stroke="rgba(150,220,255,0.22)" strokeWidth="2" />
            )}
            <circle
              cx={agent.x}
              cy={agent.y + bob}
              r="13"
              fill={agent.hp < 35 ? "rgba(255,160,160,0.28)" : "rgba(255,255,255,0.14)"}
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="1.5"
            />
            <circle cx={agent.x} cy={agent.y + bob} r="4.2" fill={AGENT_STYLE[agent.kind]} />
            <path d={`M ${agent.x + 4} ${agent.y + bob - 4} L ${armX} ${armY}`} stroke="rgba(255,255,255,0.82)" strokeWidth="2" opacity={agent.swing ? 0.92 : 0.25} />
            <circle cx={agent.x} cy={agent.y + bob} r="24" fill="none" stroke="rgba(255,255,255,0.08)" />
          </g>
        );
      })}
    </svg>
  );
}
