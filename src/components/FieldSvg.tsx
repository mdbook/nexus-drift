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
        <filter id="textBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" />
        </filter>
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
            <circle cx={turret.x} cy={turret.y} r={turret.range} fill="none" stroke="rgba(80,200,255,0.07)" strokeDasharray="7 9" />
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
        const corruptionPct = clamp(node.corruption, 0, 100);
        const toxicGlow = node.corruption > 0 ? 0.1 + node.corruption / 200 : 0;

        return (
          <g key={node.id}>
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
            <rect x={node.x - 22} y={node.y + node.size + 10} rx="4" ry="4" width="44" height="5" fill="rgba(255,255,255,0.12)" />
            <rect x={node.x - 22} y={node.y + node.size + 10} rx="4" ry="4" width={(44 * hpPct) / 100} height="5" fill="rgba(255,255,255,0.7)" />
            {node.corruption > 0 && (
              <>
                <rect x={node.x - 22} y={node.y + node.size + 18} rx="4" ry="4" width="44" height="4" fill="rgba(255,255,255,0.08)" />
                <rect x={node.x - 22} y={node.y + node.size + 18} rx="4" ry="4" width={(44 * corruptionPct) / 100} height="4" fill="rgba(195,120,255,0.92)" />
              </>
            )}
            <text x={node.x} y={node.y + 4} textAnchor="middle" fontSize="10" fill="rgba(0,0,0,1)" fontWeight="bold" style={{ letterSpacing: 1.5 }} filter="url(#textBlur)">
              {node.kind.toUpperCase()}
            </text>
            <text x={node.x} y={node.y + 4} textAnchor="middle" fontSize="10" fill={style.label} fontWeight="bold" style={{ letterSpacing: 1.5 }}>
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
        const threatPulse = 0.12 + Math.sin((game.timers.tick + enemy.id * 7) / 10) * 0.07;
        const threatRing = (
          <circle cx={enemy.x} cy={enemy.y} r={style.radius + 18} fill={`rgba(220,30,30,${threatPulse.toFixed(2)})`} stroke="rgba(255,60,60,0.45)" strokeWidth="1.2" />
        );

        if (enemy.kind === "raider") {
          return (
            <g key={enemy.id}>
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
            <g key={enemy.id}>
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

        // mite — small fast circle with sharp antenna spikes
        return (
          <g key={enemy.id}>
            {threatRing}
            <circle cx={enemy.x} cy={enemy.y} r={style.radius + 11} fill={style.glow} />
            <circle cx={enemy.x} cy={enemy.y} r={style.radius} fill={enemy.flash ? "rgba(255,255,255,0.82)" : style.fill} stroke={style.stroke} strokeWidth="1.5" />
            {/* sharp antenna spikes */}
            <line x1={enemy.x - 5} y1={enemy.y - 7} x2={enemy.x - 10} y2={enemy.y - 16} stroke="rgba(255,200,100,0.75)" strokeWidth="1.5" />
            <line x1={enemy.x + 5} y1={enemy.y - 7} x2={enemy.x + 10} y2={enemy.y - 16} stroke="rgba(255,200,100,0.75)" strokeWidth="1.5" />
            <circle cx={enemy.x - 10} cy={enemy.y - 16} r="1.5" fill="rgba(255,230,160,0.9)" />
            <circle cx={enemy.x + 10} cy={enemy.y - 16} r="1.5" fill="rgba(255,230,160,0.9)" />
            <rect x={enemy.x - 16} y={enemy.y + style.radius + 8} rx="4" ry="4" width="32" height="4" fill="rgba(255,255,255,0.12)" />
            <rect x={enemy.x - 16} y={enemy.y + style.radius + 8} rx="4" ry="4" width={(32 * hpPct) / 100} height="4" fill="rgba(255,165,60,0.95)" />
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
            <circle cx={scout.x} cy={scout.y + bob} r="18" fill="rgba(80,200,255,0.12)" stroke="rgba(120,220,255,0.50)" strokeWidth="1.3" />
            <path
              d={`M ${scout.x - 8} ${scout.y + bob + 4} L ${scout.x} ${scout.y + bob - 10} L ${scout.x + 8} ${scout.y + bob + 4} Z`}
              fill="rgba(160,235,255,0.95)"
              opacity="0.95"
            />
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

      {game.agents.map((agent) => {
        const bob = Math.sin((game.timers.tick + agent.id * 8) / 7) * 2;
        const shieldActive = game.upgrades.shield > 0;
        const panicOpacity = clamp(agent.panic / 100, 0, 1) * 0.22;
        const armAngle = (agent.swing / 24) * Math.PI * 2;
        const armX = agent.x + 8 + Math.cos(armAngle) * 5;
        const armY = agent.y + bob - 7 + Math.sin(armAngle) * 5;
        const dotColor = AGENT_STYLE[agent.kind];
        const damaged = agent.hp < 35;
        const bodyFill = damaged ? "rgba(255,130,130,0.32)" : "rgba(40,110,180,0.50)";
        const bodyStroke = damaged ? "rgba(255,150,150,0.75)" : "rgba(120,220,255,0.80)";

        // hexagon points helper
        const hex = (cx: number, cy: number, r: number) =>
          Array.from({ length: 6 }, (_, i) => {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
          }).join(" ");

        return (
          <g key={agent.id}>
            <line x1={agent.x} y1={agent.y} x2={agent.tx} y2={agent.ty} stroke="rgba(255,255,255,0.09)" strokeDasharray="4 5" />
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
