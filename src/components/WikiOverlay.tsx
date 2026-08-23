import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  Bot,
  Bug,
  Coins,
  Cpu,
  Crosshair,
  Database,
  Diamond,
  Droplet,
  Eye,
  Flame,
  Gem,
  Ghost,
  Hexagon,
  Layers,
  Pickaxe,
  Radar,
  Radiation,
  Rocket,
  ShieldAlert,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Target,
  Waves,
  Wind,
  X,
  Zap,
  Cloud,
  Siren,
  AlertTriangle,
  Sun,
  Satellite,
  PackageOpen,
  Moon,
  Star,
  Biohazard,
  Lock,
  EyeOff,
  ScrollText,
  FileWarning,
} from "lucide-react";

import { LORE_UNLOCKS } from "@/game/lore";

// ─── Types ────────────────────────────────────────────────────────────────────

type WikiIcon = ComponentType<{ className?: string }>;

type Accent = "cyan" | "violet" | "amber" | "rose" | "emerald" | "fuchsia";

type WikiEntry = {
  id: string;
  code: string;
  title: string;
  icon: WikiIcon;
  accent: Accent;
  tagline: string;
  lore: string;
  notes?: string[];
  preview?: ReactNode;
  // Gated entries stay redacted until their matching `LORE_UNLOCKS[id]` test
  // passes. `hidden: true` MUST correspond 1:1 with a key in `LORE_UNLOCKS`
  // (enforced by lore.test.ts). `lockedHint` is the in-tone recovery condition
  // shown on the redacted card.
  hidden?: boolean;
  lockedHint?: string;
};

type WikiCategory = {
  id: string;
  label: string;
  icon: WikiIcon;
  description: string;
  entries: WikiEntry[];
};

// ─── Accent palette ───────────────────────────────────────────────────────────

const ACCENT_TEXT: Record<Accent, string> = {
  cyan: "text-cyan-300",
  violet: "text-violet-300",
  amber: "text-amber-300",
  rose: "text-rose-300",
  emerald: "text-emerald-300",
  fuchsia: "text-fuchsia-300",
};

const ACCENT_BORDER: Record<Accent, string> = {
  cyan: "border-cyan-400/30",
  violet: "border-violet-400/30",
  amber: "border-amber-400/30",
  rose: "border-rose-400/30",
  emerald: "border-emerald-400/30",
  fuchsia: "border-fuchsia-400/30",
};

const ACCENT_GLOW: Record<Accent, string> = {
  cyan: "shadow-[0_0_32px_-8px_rgba(34,211,238,0.55)]",
  violet: "shadow-[0_0_32px_-8px_rgba(167,139,250,0.55)]",
  amber: "shadow-[0_0_32px_-8px_rgba(251,191,36,0.55)]",
  rose: "shadow-[0_0_32px_-8px_rgba(251,113,133,0.55)]",
  emerald: "shadow-[0_0_32px_-8px_rgba(52,211,153,0.55)]",
  fuchsia: "shadow-[0_0_32px_-8px_rgba(232,121,249,0.55)]",
};

// ─── Preview SVGs ─────────────────────────────────────────────────────────────

const PREVIEW_SIZE = 72;

function PreviewSvg({ children }: { children: ReactNode }) {
  return (
    <svg width={PREVIEW_SIZE} height={PREVIEW_SIZE} viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
      {children}
    </svg>
  );
}

function WorkerAura() {
  return (
    <circle
      cx={40}
      cy={40}
      r={22}
      fill="rgba(80,200,255,0.08)"
      stroke="rgba(80,200,255,0.18)"
      strokeWidth={1}
    />
  );
}

// Hex polygon points centered at (40, 40) with radius 13
const HEX_R = 13;
const HEX_POINTS = [0, 60, 120, 180, 240, 300]
  .map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const x = 40 + HEX_R * Math.cos(rad);
    const y = 40 + HEX_R * Math.sin(rad);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  })
  .join(" ");

const MINER_PREVIEW = (
  <PreviewSvg>
    <WorkerAura />
    <polygon
      points={HEX_POINTS}
      fill="rgba(40,110,180,0.50)"
      stroke="rgba(120,220,255,0.80)"
      strokeWidth={2}
    />
    {/* pickaxe arm hint at -30deg */}
    <line
      x1={40 + Math.cos((-30 * Math.PI) / 180) * 9}
      y1={40 + Math.sin((-30 * Math.PI) / 180) * 9}
      x2={40 + Math.cos((-30 * Math.PI) / 180) * 17}
      y2={40 + Math.sin((-30 * Math.PI) / 180) * 17}
      stroke="rgba(255,210,80,1.0)"
      strokeWidth={2}
      opacity={0.8}
    />
    <circle cx={40} cy={40} r={5} fill="rgba(255,210,80,1.0)" />
  </PreviewSvg>
);

const RUNNER_PREVIEW = (
  <PreviewSvg>
    <WorkerAura />
    <path
      d="M 40 29 L 55 40 L 40 51 L 25 40 Z"
      fill="rgba(40,110,180,0.50)"
      stroke="rgba(120,220,255,0.80)"
      strokeWidth={2}
    />
    {/* speed streaks trailing behind */}
    <line x1={25} y1={38} x2={16} y2={36} stroke="rgba(100,200,255,1.0)" strokeWidth={1.5} opacity={0.4} />
    <line x1={25} y1={42} x2={18} y2={44} stroke="rgba(100,200,255,1.0)" strokeWidth={1.5} opacity={0.2} />
    <circle cx={40} cy={40} r={5} fill="rgba(100,200,255,1.0)" />
  </PreviewSvg>
);

const DRONE_PREVIEW = (
  <PreviewSvg>
    <WorkerAura />
    <circle
      cx={40}
      cy={40}
      r={13}
      fill="rgba(40,110,180,0.50)"
      stroke="rgba(120,220,255,0.80)"
      strokeWidth={2}
    />
    <ellipse
      cx={40}
      cy={40}
      rx={20}
      ry={5}
      fill="none"
      stroke="rgba(120,255,190,1.0)"
      strokeWidth={1}
      opacity={0.55}
      transform="rotate(-25, 40, 40)"
    />
    <circle cx={40} cy={40} r={5} fill="rgba(120,255,190,1.0)" />
  </PreviewSvg>
);

function ResourceNode({
  fill,
  stroke,
  highlight,
  label,
  labelFill,
}: {
  fill: string;
  stroke: string;
  highlight: string;
  label: string;
  labelFill: string;
}) {
  return (
    <PreviewSvg>
      <circle cx={40} cy={40} r={18} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <circle cx={36} cy={36} r={5.5} fill={highlight} />
      <text
        x={40}
        y={62}
        textAnchor="middle"
        fontSize={8}
        fontWeight="bold"
        letterSpacing={1.5}
        fill={labelFill}
        fontFamily="monospace"
      >
        {label}
      </text>
    </PreviewSvg>
  );
}

const GOLD_PREVIEW = (
  <ResourceNode
    fill="rgba(255,200,50,0.28)"
    stroke="rgba(255,215,80,0.80)"
    highlight="rgba(255,230,140,0.95)"
    label="GOLD"
    labelFill="rgba(255,240,180,0.98)"
  />
);

const ORE_PREVIEW = (
  <ResourceNode
    fill="rgba(118,128,140,0.38)"
    stroke="rgba(145,155,168,0.85)"
    highlight="rgba(175,184,194,0.95)"
    label="ORE"
    labelFill="rgba(200,208,220,0.98)"
  />
);

const GEMS_PREVIEW = (
  <ResourceNode
    fill="rgba(80,255,210,0.24)"
    stroke="rgba(100,255,220,0.72)"
    highlight="rgba(180,255,238,0.95)"
    label="GEMS"
    labelFill="rgba(180,255,238,0.98)"
  />
);

const ENERGY_PREVIEW = (
  <ResourceNode
    fill="rgba(100,255,130,0.24)"
    stroke="rgba(120,255,150,0.72)"
    highlight="rgba(190,255,205,0.92)"
    label="ENRGY"
    labelFill="rgba(190,255,205,0.98)"
  />
);

function EnemyAntennae() {
  return (
    <>
      <line x1={35} y1={33} x2={30} y2={24} stroke="rgba(255,200,100,0.75)" strokeWidth={1.5} />
      <line x1={45} y1={33} x2={50} y2={24} stroke="rgba(255,200,100,0.75)" strokeWidth={1.5} />
      <circle cx={30} cy={24} r={1.5} fill="rgba(255,200,100,0.75)" />
      <circle cx={50} cy={24} r={1.5} fill="rgba(255,200,100,0.75)" />
    </>
  );
}

function GenericEnemy({ r, fill, stroke, glow }: { r: number; fill: string; stroke: string; glow: string }) {
  return (
    <PreviewSvg>
      <circle cx={40} cy={40} r={r + 11} fill={glow} />
      <circle cx={40} cy={40} r={r} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <EnemyAntennae />
    </PreviewSvg>
  );
}

const MITE_PREVIEW = (
  <GenericEnemy
    r={11}
    fill="rgba(255,145,55,0.88)"
    stroke="rgba(255,230,180,0.7)"
    glow="rgba(255,120,30,0.22)"
  />
);

const RAIDER_PREVIEW = (
  <PreviewSvg>
    <rect
      x={20}
      y={20}
      width={40}
      height={40}
      rx={5}
      fill="rgba(100,10,25,0.55)"
      stroke="rgba(255,160,170,0.75)"
      strokeWidth={2.5}
    />
    <rect x={26} y={26} width={28} height={28} rx={3} fill="rgba(160,20,50,0.92)" />
    <line x1={30} y1={40} x2={50} y2={40} stroke="rgba(255,180,190,0.7)" strokeWidth={2} />
    <line x1={40} y1={30} x2={40} y2={50} stroke="rgba(255,180,190,0.7)" strokeWidth={2} />
  </PreviewSvg>
);

const WISP_PREVIEW = (
  <PreviewSvg>
    <circle cx={40} cy={40} r={22} fill="rgba(160,200,255,0.12)" />
    <path
      d="M 40 22 L 47 40 L 40 55 L 33 40 Z"
      fill="rgba(160,200,255,0.92)"
      stroke="rgba(210,230,255,0.80)"
      strokeWidth={1.5}
    />
    <circle cx={40} cy={40} r={3} fill="rgba(200,245,230,0.9)" />
  </PreviewSvg>
);

const RUSHER_PREVIEW = (
  <GenericEnemy
    r={8}
    fill="rgba(255,214,64,0.92)"
    stroke="rgba(255,246,190,0.8)"
    glow="rgba(255,214,64,0.24)"
  />
);

const BRUTE_PREVIEW = (
  <GenericEnemy
    r={22}
    fill="rgba(110,122,145,0.92)"
    stroke="rgba(224,232,246,0.75)"
    glow="rgba(140,156,182,0.24)"
  />
);

const SAPPER_PREVIEW = (
  <PreviewSvg>
    <circle cx={40} cy={40} r={26} fill="none" stroke="#f43f5e" strokeWidth={1} opacity={0.3} />
    <circle cx={40} cy={40} r={17} fill="rgba(255,82,119,0.24)" />
    <circle
      cx={40}
      cy={40}
      r={6}
      fill="rgba(255,82,119,0.92)"
      stroke="rgba(255,212,224,0.8)"
      strokeWidth={1.5}
    />
    <line x1={32} y1={40} x2={48} y2={40} stroke="rgba(255,230,230,0.8)" strokeWidth={1.5} />
    <line x1={40} y1={32} x2={40} y2={48} stroke="rgba(255,230,230,0.8)" strokeWidth={1.5} />
  </PreviewSvg>
);

const BLIGHT_PREVIEW = (
  <GenericEnemy
    r={14}
    fill="rgba(155,240,185,0.88)"
    stroke="rgba(228,255,236,0.8)"
    glow="rgba(114,230,145,0.24)"
  />
);

const LEECH_PREVIEW = (
  <PreviewSvg>
    <circle cx={40} cy={40} r={23} fill="rgba(129,140,248,0.24)" />
    <circle
      cx={40}
      cy={40}
      r={19}
      fill="none"
      stroke="rgba(140,220,255,0.55)"
      strokeDasharray="3 2.5"
      strokeWidth={1.8}
    />
    <circle
      cx={40}
      cy={40}
      r={12}
      fill="rgba(129,140,248,0.92)"
      stroke="rgba(224,228,255,0.8)"
      strokeWidth={1.5}
    />
    <EnemyAntennae />
  </PreviewSvg>
);

const PHANTOM_PREVIEW = (
  <PreviewSvg>
    <circle cx={40} cy={40} r={24} fill="rgba(226,232,240,0.18)" />
    <circle
      cx={40}
      cy={40}
      r={20}
      fill="none"
      stroke="rgba(140,220,255,0.55)"
      strokeDasharray="3 2.5"
      strokeWidth={1.8}
    />
    <circle
      cx={40}
      cy={40}
      r={13}
      fill="rgba(226,232,240,0.9)"
      stroke="rgba(255,255,255,0.8)"
      strokeWidth={1.5}
    />
    <EnemyAntennae />
  </PreviewSvg>
);

const ZAPPER_PREVIEW = (
  <PreviewSvg>
    <circle
      cx={40}
      cy={40}
      r={22}
      fill="none"
      stroke="rgba(140,220,255,0.55)"
      strokeDasharray="3 2.5"
      strokeWidth={1.8}
    />
    <line x1={29} y1={49} x2={22} y2={20} stroke="rgba(230,200,255,0.60)" strokeWidth={1} />
    <line x1={51} y1={49} x2={58} y2={20} stroke="rgba(230,200,255,0.60)" strokeWidth={1} />
    <path
      d="M 40 27 L 51 49 L 29 49 Z"
      fill="rgba(180,80,255,0.88)"
      stroke="rgba(230,200,255,0.80)"
      strokeWidth={1.5}
    />
    <circle cx={22} cy={20} r={2.5} fill="rgba(230,160,255,0.9)" />
    <circle cx={58} cy={20} r={2.5} fill="rgba(230,160,255,0.9)" />
  </PreviewSvg>
);

const WARDEN_PREVIEW = (
  <GenericEnemy
    r={16}
    fill="rgba(96,40,150,0.78)"
    stroke="rgba(210,170,255,0.82)"
    glow="rgba(150,70,220,0.34)"
  />
);

const CORRUPTOR_PREVIEW = (
  <PreviewSvg>
    <circle cx={40} cy={40} r={22} fill="rgba(160,70,255,0.08)" />
    <circle
      cx={40}
      cy={40}
      r={12}
      fill="rgba(172,92,255,0.82)"
      stroke="rgba(240,190,255,0.55)"
      strokeWidth={1.4}
    />
    <circle cx={35} cy={35} r={4} fill="rgba(245,210,255,0.75)" />
    <path d="M 31 49 q 7 10 18 4" stroke="rgba(235,180,255,0.7)" strokeWidth={2} fill="none" />
  </PreviewSvg>
);

const TURRET_PREVIEW = (
  <PreviewSvg>
    <circle cx={40} cy={40} r={22} fill="rgba(80,200,255,0.10)" />
    <circle
      cx={40}
      cy={40}
      r={14}
      fill="rgba(40,120,200,0.55)"
      stroke="rgba(120,220,255,0.75)"
      strokeWidth={2}
    />
    <line
      x1={40}
      y1={40}
      x2={40}
      y2={19}
      stroke="rgba(160,235,255,0.95)"
      strokeWidth={3.5}
      strokeLinecap="round"
    />
  </PreviewSvg>
);

const SILO_PREVIEW = (
  <PreviewSvg>
    <rect
      x={34}
      y={20}
      width={12}
      height={22}
      rx={2}
      fill="rgba(200,80,20,0.75)"
      stroke="rgba(255,160,60,0.80)"
      strokeWidth={1.5}
    />
    <line
      x1={40}
      y1={20}
      x2={40}
      y2={8}
      stroke="rgba(255,180,80,0.95)"
      strokeWidth={3}
      strokeLinecap="round"
    />
    <rect x={35} y={42} width={10} height={2} fill="rgba(255,200,60,0.80)" />
  </PreviewSvg>
);

const SCOUT_PREVIEW = (
  <PreviewSvg>
    <circle
      cx={40}
      cy={40}
      r={16}
      fill="rgba(80,200,255,0.10)"
      stroke="rgba(120,220,255,0.42)"
      strokeWidth={1.1}
    />
    <line
      x1={40}
      y1={32}
      x2={40}
      y2={18}
      stroke="rgba(120,220,255,0.90)"
      strokeWidth={2.5}
      strokeLinecap="round"
    />
    <path
      d="M 40 32 L 45.5 41.5 L 40 48 L 34.5 41.5 Z"
      fill="rgba(160,235,255,0.86)"
      stroke="rgba(210,248,255,0.82)"
      strokeWidth={1.2}
    />
    <circle cx={40} cy={40} r={3} fill="rgba(120,255,210,0.6)" />
  </PreviewSvg>
);

const SENTINEL_PREVIEW = (
  <PreviewSvg>
    <circle cx={40} cy={40} r={22} fill="none" stroke="#fbbf24" strokeWidth={0.5} opacity={0.2} />
    <polygon points="40,31 46.3,40 40,49 33.7,40" fill="#fbbf24" stroke="#f59e0b" strokeWidth={1.5} />
  </PreviewSvg>
);

// ─── Content ──────────────────────────────────────────────────────────────────

const CATEGORIES: WikiCategory[] = [
  {
    id: "entities",
    label: "Field Entities",
    icon: Bot,
    description: "Living signatures on the sector grid — ours and not.",
    entries: [
      {
        id: "auto-miner",
        code: "WRK-01",
        title: "Auto Miner",
        icon: Pickaxe,
        accent: "amber",
        tagline: "Left-sector specialist. Pushes deep. Rarely complains.",
        preview: MINER_PREVIEW,
        lore: "Ore-line units built for the long haul. They drift out to the far rim of the left sector and grind on seams long after colony advisories ping yellow. Telemetry from recovered chassis shows an unusual rise in extraction rate during calm hours — like they enjoy the quiet.",
        notes: [
          "Favour the deepest left-side deposits; they will not retreat lightly.",
          "Overclock passively when no hostiles are in their lane.",
          "Brave, but fragile when cornered by more than one attacker.",
        ],
      },
      {
        id: "ops-bot",
        code: "WRK-02",
        title: "Ops Bot",
        icon: Bot,
        accent: "cyan",
        tagline: "Mid-field logistics runner. Flinches. Survives.",
        preview: RUNNER_PREVIEW,
        lore: "The sector's middle belt belongs to Ops. They balance ore and flux hauls through the most trafficked corridors, which means they also catch most of the crossfire. Courage is moderate; panic-sprint protocols were added after the third lane-collapse incident.",
        notes: [
          "Routes prefer the mid-field where raids tend to cluster.",
          "Will break contact and sprint clear when cornered.",
          "Reliable under moderate pressure; first to crack under real siege.",
        ],
      },
      {
        id: "scout-drone",
        code: "WRK-03",
        title: "Scout Drone",
        icon: Radar,
        accent: "cyan",
        tagline: "Right-sector harvester. Careful. Always listening.",
        preview: DRONE_PREVIEW,
        lore: "Energy and gem seams live on the right rim, and Scout Drones inherited the beat. Their chassis hums with a passive corruption scanner — older pilots swear the drones pull back seconds before a void reading actually trips. Cautious to a fault, and the colony is better for it.",
        notes: [
          "Harvest gem and energy nodes; never ore lines.",
          "Back off early when threat density spikes.",
          "Passive corruption sensing feeds the purge wing's target list.",
        ],
      },
      {
        id: "mite",
        code: "HSTL-01",
        title: "Mite",
        icon: Bug,
        accent: "rose",
        tagline: "Swarm unit. Smallest teeth. Lots of them.",
        preview: MITE_PREVIEW,
        lore: "The first thing a new colony sees. Mites are crude void-spawn, barely shaped, barely intelligent — they pick a target and go. Alone, a non-event. In a column, they chew through unattended miners before anyone notices the lane.",
        notes: [
          "Direct pursuers — no flanking, no tricks.",
          "Dangerous in numbers; trivial in isolation.",
          "Often the first wave, rarely the last.",
        ],
      },
      {
        id: "raider",
        code: "HSTL-02",
        title: "Raider",
        icon: Swords,
        accent: "rose",
        tagline: "Flanking predator. Leads the shot.",
        preview: RAIDER_PREVIEW,
        lore: "Raiders don't charge — they arc. They read worker movement vectors and come in from the side, preferring miners who have wandered too far from a turret shadow. If a single drone goes dark on the rim, odds are a raider saw it go.",
        notes: [
          "Pick isolated workers over the main herd.",
          "Predict target position; hard to juke in open lane.",
          "Will disengage if outgunned — briefly.",
        ],
      },
      {
        id: "wisp",
        code: "HSTL-03",
        title: "Wisp",
        icon: Ghost,
        accent: "violet",
        tagline: "Ghost-class flanker. Barely there.",
        preview: WISP_PREVIEW,
        lore: "A smear of light on the grid, gone before the eye finishes parsing it. Wisps slip between turret cones at speeds the hardware struggles to resolve. The standard doctrine is don't track them — track where they haven't been yet, and wait.",
        notes: [
          "Fastest standard hostile; hardest to pin.",
          "Prefers tight weaves through contested lanes.",
          "Fragile once actually hit — the hard part is hitting.",
        ],
      },
      {
        id: "rusher",
        code: "HSTL-04",
        title: "Rusher",
        icon: Rocket,
        accent: "rose",
        tagline: "Glass cannon. Drone-hunter. Blinks in, gone.",
        preview: RUSHER_PREVIEW,
        lore: "Everything a rusher has goes into one straight line. It will ignore your turrets, your sentinels, your front line — and put a scout drone on the floor before anyone locks on. Once its sprint is spent, it folds like paper.",
        notes: [
          "Preferentially targets scouts and other fragile units.",
          "Extreme speed, negligible armour.",
          "Cannot course-correct mid-charge.",
        ],
      },
      {
        id: "brute",
        code: "HSTL-05",
        title: "Brute",
        icon: Shield,
        accent: "amber",
        tagline: "Slow. Enormous. Takes the turrets with it.",
        preview: BRUTE_PREVIEW,
        lore: "A mountain of plating around a void-slab heart. Brutes move at a crawl and do not care — they eat turret fire like weather and put themselves face-first into the perimeter. When one finally comes apart, the Core fragment it leaves behind is worth the damage.",
        notes: [
          "Drops Core fragments on death — non-resetting, precious.",
          "Prioritises static defences over workers.",
          "Missile silos were built for this silhouette.",
        ],
      },
      {
        id: "sapper",
        code: "HSTL-06",
        title: "Sapper",
        icon: Flame,
        accent: "amber",
        tagline: "Suicide ambusher. Dashes. Ends loudly.",
        preview: SAPPER_PREVIEW,
        lore: "Sappers aren't enemies so much as payloads with legs. They close range in a single committed dash and detonate against whatever structure they reach. If a perimeter turret disappears between frames, a sapper was there between frames.",
        notes: [
          "Targets buildings, not workers.",
          "Closes distance in one explosive commitment.",
          "Dies on impact — the death is the attack.",
        ],
      },
      {
        id: "leech",
        code: "HSTL-07",
        title: "Leech",
        icon: Droplet,
        accent: "fuchsia",
        tagline: "Skips the fight. Goes for the vault.",
        preview: LEECH_PREVIEW,
        lore: "Leeches ignore workers, turrets, sentinels — everything. They track straight for the home district and start draining gold and energy the moment they touch it. By the time a leech is on the wall, the sector economy is already bleeding.",
        notes: [
          "Bypasses combat units entirely.",
          "Drains resources on contact with the home district.",
          "Missile silos flag leeches as priority targets.",
        ],
      },
      {
        id: "phantom",
        code: "HSTL-08",
        title: "Phantom",
        icon: Eye,
        accent: "violet",
        tagline: "Sentinel-assassin. Cloaks. Reappears behind you.",
        preview: PHANTOM_PREVIEW,
        lore: "Phantoms do not brawl. They drop cloak, reposition behind the line, and select a high-value target — usually a sentinel mid-cleanse. A shield layer buys them the seconds they need to recloak before return fire arrives.",
        notes: [
          "Cloaks to reposition; uncloaks to strike.",
          "Carries a shield layer above its HP.",
          "Hunts sentinels and late-game assets over swarms.",
        ],
      },
      {
        id: "zapper",
        code: "HSTL-09",
        title: "Zapper",
        icon: Zap,
        accent: "violet",
        tagline: "Range holder. Freezes the line.",
        preview: ZAPPER_PREVIEW,
        lore: "Zappers hang back at the edge of engagement range and throw disable bolts into whichever asset looks most useful. A frozen turret is a silent turret; a frozen worker is a worker waiting to die. The disable is not long — it is only long enough.",
        notes: [
          "Disable bolts lock turrets and workers for several seconds.",
          "Stays at range; rarely commits into melee.",
          "Priority target for purge wing when anything else is frozen.",
        ],
      },
      {
        id: "corruptor",
        code: "VOID-01",
        title: "Corruptor",
        icon: Biohazard,
        accent: "fuchsia",
        tagline: "Attaches to nodes. Rots them slowly. Never fights.",
        preview: CORRUPTOR_PREVIEW,
        lore: "Corruptors do not attack. They crawl onto a resource node, anchor, and begin the rot. Yields drop, then invert. Left alone, a single corruptor will hollow a gem seam before the next pay cycle. They are not dangerous — they are patient.",
        notes: [
          "Attach to resource nodes; ignore workers entirely.",
          "Steadily reduces node yield the longer they hold.",
          "Scouts are built to burn them off.",
        ],
      },
      {
        id: "blight",
        code: "VOID-02",
        title: "Blight",
        icon: Radiation,
        accent: "fuchsia",
        tagline: "Heavy corruptor. Faster rot. Harder to burn off.",
        preview: BLIGHT_PREVIEW,
        lore: "A corruptor that grew up. Blights carry more mass and more resistance — scout fire that would sear a standard corruptor only irritates a blight. Rot accelerates when they settle, and two blights on one seam can finish it before a purge team even arrives.",
        notes: [
          "Much faster corruption spread than baseline.",
          "Partially resistant to scout fire; pair up on them.",
          "A cleanse pays extra flux when it finally lands.",
        ],
      },
      {
        id: "warden",
        code: "VOID-03",
        title: "Warden",
        icon: Ghost,
        accent: "fuchsia",
        tagline: "Does not fight. Infects. Vanishes.",
        preview: WARDEN_PREVIEW,
        lore: "The thing you see in the corner of the scope and then can't find again. Wardens stalk individual workers for long minutes, never attacking, never drawing fire — and then the worker's telemetry goes wrong, and the warden is already somewhere else. Sentinels exist in large part because of them.",
        notes: [
          "No attack profile; infection is the whole behaviour.",
          "Disappears from the field after a successful infect.",
          "Sentinel cleanse beams are the reliable counter.",
        ],
      },
    ],
  },
  {
    id: "resources",
    label: "Resources",
    icon: Gem,
    description: "What the sector is worth, and why we keep coming back.",
    entries: [
      {
        id: "gold",
        code: "RES-01",
        title: "Gold",
        icon: Coins,
        accent: "amber",
        tagline: "Colony currency. Anchors the early economy.",
        preview: GOLD_PREVIEW,
        lore: "The ledger still runs on gold — a convention older than any of the gear pulling it out of the ground. Every upgrade, every perimeter, every new turret begins as a gold line in the logbook. When the vault runs dry, the colony runs quiet.",
      },
      {
        id: "ore",
        code: "RES-02",
        title: "Ore",
        icon: Pickaxe,
        accent: "amber",
        tagline: "Raw extraction material. The baseline pull.",
        preview: ORE_PREVIEW,
        lore: "Dense, grey, abundant, and almost never interesting on its own — ore is the filler that makes everything else possible. The left sector is nearly all ore seams, which is why the Auto Miners never stop walking.",
      },
      {
        id: "gems",
        code: "RES-03",
        title: "Gems",
        icon: Gem,
        accent: "cyan",
        tagline: "Crystalline rarity. Required to step up.",
        preview: GEMS_PREVIEW,
        lore: "Crystalline formations that shouldn't, by any local geology, exist. Gems are the currency of prestige — of leaving this sector behind and stepping into the next. Colonies without gems stay colonies. Colonies with gems become something else.",
      },
      {
        id: "energy",
        code: "RES-04",
        title: "Energy",
        icon: Zap,
        accent: "cyan",
        tagline: "Power infrastructure. Falls with the city.",
        preview: ENERGY_PREVIEW,
        lore: "The colony's heartbeat. Energy output is modulated by the city's health — take a hit on the home district and the grid dims in real time. Everything with a sensor, a turret, or a beam is watching the energy line.",
      },
      {
        id: "cores",
        code: "RES-05",
        title: "Cores",
        icon: Hexagon,
        accent: "violet",
        tagline: "Fragments from elite kills. Do not reset.",
        lore: "Cores drop from brutes and other heavy voidspawn. They do not reset on prestige. They do not refund on teardown. A colony's true wealth isn't the gold in its vault — it's the core pile in the back room, hoarded through every reset.",
      },
      {
        id: "flux",
        code: "RES-06",
        title: "Flux",
        icon: Waves,
        accent: "fuchsia",
        tagline: "Resonance material. Only from fighting corruption.",
        lore: "Flux is what a cleansed node gives back. You cannot mine it. You cannot trade for it. The only way to earn flux is to burn corruption out of the seam that carries it — and that means feeding scouts, sentinels, and purge wings faster than the void can spread.",
      },
    ],
  },
  {
    id: "defenses",
    label: "Defenses",
    icon: Shield,
    description: "The things standing between the field and the void.",
    entries: [
      {
        id: "turret",
        code: "DEF-01",
        title: "Defense Turret",
        icon: Crosshair,
        accent: "cyan",
        tagline: "Perimeter gun. Unlocks once siege class arrives.",
        preview: TURRET_PREVIEW,
        lore: "Turrets do not show up until the sector starts taking real hits. They are perimeter weapons — short range, fast cadence, plain and endlessly repairable — and they go in the ground the day the first brute walks the line. Sustained assault breaks them, and the hull reboots at half health: scarred, ready, already reacquiring.",
        notes: [
          "Unlocks at Tier 3 (Raid). Brutes and sappers are the design target.",
          "Breaks under concentrated pressure; reboots rather than dies.",
          "Lane coverage only; will not chase.",
        ],
      },
      {
        id: "scout",
        code: "DEF-02",
        title: "Assault Scout",
        icon: Radar,
        accent: "cyan",
        tagline: "Mobile anti-corruption unit. Paired cleanses.",
        preview: SCOUT_PREVIEW,
        lore: "Scouts roam. They do not hold lanes — they hunt rot. When a node is heavily corrupted they pair up automatically, because one scout against a dug-in blight is a long, bad fight. Take damage and the scout breaks contact; we build replacements, not martyrs.",
        notes: [
          "Autonomous target selection against void contamination.",
          "Retreats when damaged; re-engages once healed.",
          "Pairs up on heavily corrupted nodes.",
        ],
      },
      {
        id: "sentinel",
        code: "DEF-03",
        title: "Sentinel Mech",
        icon: ShieldAlert,
        accent: "violet",
        tagline: "Late-game guardian. Purple beam. Purifies on contact.",
        preview: SENTINEL_PREVIEW,
        lore: "The sentinel is what you field when the sector has stopped being polite. It intercepts threats close to workers and carries a cleanse beam that does not kill so much as remove — infected workers walk away human, and the thing that was inside them does not walk away at all.",
        notes: [
          "Positions near workers, not the perimeter.",
          "Cleanse beam purifies warden-infected workers.",
          "Counts sentinel kills only on the lethal hit.",
        ],
      },
      {
        id: "silo",
        code: "DEF-04",
        title: "Missile Silo",
        icon: Target,
        accent: "amber",
        tagline: "First watcher of the rim. Stand-off strike from day one.",
        preview: SILO_PREVIEW,
        lore: "Every colony lands with one silo already armed. It is the first thing the rim ever sees fire back — a long, patient sweep of the field that picks apart anything wandering in from the dark. Slow cadence, heavy single shot, no perimeter to hold. As the threat profile escalates the priority list reshuffles to brutes and leeches first, but the silo opens the engagement long before any of that arrives.",
        notes: [
          "Available from the start. One silo active by default.",
          "Long range; slow reload cadence; no perimeter coverage.",
          "Reprioritises brutes and leeches once they appear.",
          "Structural — does not take damage.",
        ],
      },
    ],
  },
  {
    id: "operations",
    label: "Sector Operations",
    icon: Layers,
    description: "The systems the colony runs on.",
    entries: [
      {
        id: "corruption",
        code: "OPS-01",
        title: "Corruption",
        icon: Biohazard,
        accent: "fuchsia",
        tagline: "Void contamination. Spreads through the seams.",
        lore: "Corruption is not a faction. It is a condition — the sector's slow answer to anyone who tries to extract from it. It moves through resource nodes, reduces yields, and does not burn off on its own. Active purge is the entire defence.",
        notes: [
          "Spreads between connected nodes over time.",
          "Reduces yield the longer it lingers.",
          "Cleansing a node pays flux on completion.",
        ],
      },
      {
        id: "prestige",
        code: "OPS-02",
        title: "Prestige",
        icon: Sparkles,
        accent: "amber",
        tagline: "Colony reset. Permanent multiplier. Steep cost.",
        lore: "Every colony eventually reaches the ceiling of what this sector will give it. Prestige is the decision to fold — to trade accumulated wealth for a permanent multiplier on the next run. Requires extreme resource reserves; the colony that prestiges is the colony that could have kept going.",
        notes: [
          "Resets most progression; stacks a permanent bonus.",
          "Cores do not reset across prestige.",
          "Gated behind exceptional wealth thresholds.",
        ],
      },
      {
        id: "progression",
        code: "OPS-03",
        title: "Sector Progression",
        icon: Star,
        accent: "amber",
        tagline: "Threat scales with the colony. Tiers unlock enemies.",
        lore: "The sector watches. As the colony grows — upgrades, slots, prestige stacks — the void sends heavier envelopes in response. Tiers unlock enemy variants, not just more of the same. A quiet colony is a colony not yet seen.",
        notes: [
          "Tier climbs with a combined progression score.",
          "Higher tiers introduce new hostile archetypes.",
          "Capped display tier; underlying score keeps climbing.",
        ],
      },
      {
        id: "slots",
        code: "OPS-04",
        title: "Worker Slots",
        icon: Bot,
        accent: "cyan",
        tagline: "More hands. Late. Expensive. Conditional.",
        lore: "Each worker kind starts with exactly one active unit and two dormant slots. Unlocking those slots takes both upgrade investment and sector advancement — the colony has to want them and deserve them. A recovered lost drone is the one recorded exception.",
        notes: [
          "Second slot gates at upgrade level 3 plus sector level 22.",
          "Third slot gates at upgrade level 10 plus sector level 42.",
          "Slot purchases cost flux and cores on top of gold.",
        ],
      },
      {
        id: "city",
        code: "OPS-05",
        title: "City / Home District",
        icon: Cpu,
        accent: "cyan",
        tagline: "The colony's heart. Also a target.",
        lore: "The home district is not a unit — it is the reason units exist. Uncontested incursions chew directly into its walls. Energy output is bound to its health, which makes every breach a two-layered wound: less wall, less grid. Keep it intact.",
        notes: [
          "Takes damage when enemies reach the colony untouched.",
          "Energy output scales with remaining health.",
          "Primary target for leeches.",
        ],
      },
    ],
  },
  {
    id: "events",
    label: "Field Events",
    icon: Siren,
    description: "Sector anomalies that come in, shake the board, and leave.",
    entries: [
      {
        id: "meteor-shower",
        code: "EVT-01",
        title: "Meteor Shower",
        icon: Diamond,
        accent: "amber",
        tagline: "Boon. Yields surge across the field.",
        lore: "The sky lights up and the numbers follow. For a short window every node in the sector pays more — the kind of payout that turns a routine shift into a banner hour. Usually harmless. Usually.",
      },
      {
        id: "solar-flare",
        code: "EVT-02",
        title: "Solar Flare",
        icon: Sun,
        accent: "amber",
        tagline: "Mixed. Energy spikes, targeting suffers.",
        lore: "The grid sings, and the sensors scream. Energy pours in while targeting systems across the colony get noisy enough to miss shots that should not be missed. A profitable mess, if nothing heavy is already on the perimeter.",
      },
      {
        id: "cache-discovery",
        code: "EVT-03",
        title: "Cache Discovery",
        icon: PackageOpen,
        accent: "cyan",
        tagline: "Boon. A forgotten gem cache surfaces.",
        lore: "Somebody else's bad day, a long time ago. A buried gem cache ticks up through the regolith and onto the sector feed — bonus crystals, no effort, no catch. The colony takes the gift and does not ask.",
      },
      {
        id: "pirate-caravan",
        code: "EVT-04",
        title: "Pirate Caravan",
        icon: Swords,
        accent: "rose",
        tagline: "Mixed. Raiders arrive with loot on board.",
        lore: "Not a raid — a convoy. Pirate raiders come through the lanes carrying bonus cargo, and every one that drops pays extra on top of the standard bounty. The trade is straightforward: survive them, and profit.",
      },
      {
        id: "xeno-bloom",
        code: "EVT-05",
        title: "Xeno Bloom",
        icon: Biohazard,
        accent: "fuchsia",
        tagline: "Mixed. Corruption accelerates; purges pay triple flux.",
        lore: "The void exhales. Corruption spreads visibly faster across the sector — but every successful purge during the bloom returns triple flux. A fight worth having, if the purge wing is already standing.",
      },
      {
        id: "dust-storm",
        code: "EVT-06",
        title: "Dust Storm",
        icon: Wind,
        accent: "amber",
        tagline: "Mixed. Turret range collapses; enemies slow.",
        lore: "Visibility dies. Turret cones shrink to knife range, and every hostile on the grid wades through the same weather. A patient defence still wins this one; a sloppy defence loses the perimeter.",
      },
      {
        id: "echo-signal",
        code: "EVT-07",
        title: "Echo Signal",
        icon: Satellite,
        accent: "violet",
        tagline: "Rare. Elite-signature brute. Enormous core drop.",
        lore: "A ping from the far rim — old, huge, not in any known signature library. Whatever answers the ping answers as a brute, but bigger, slower, heavier. If it goes down, the core fragment it leaves behind funds half a prestige.",
      },
      {
        id: "core-breach",
        code: "EVT-08",
        title: "Core Breach",
        icon: AlertTriangle,
        accent: "rose",
        tagline: "Threat. Reactor shudders. Energy halved. Rot spreads.",
        lore: "The reactor does not fail — but it flinches. Energy output drops by half while engineers chase the fault, and in the gap corruption accelerates through every exposed seam. A bad time to run a thin line.",
      },
      {
        id: "hunter-pack",
        code: "EVT-09",
        title: "Hunter Pack",
        icon: Swords,
        accent: "rose",
        tagline: "Threat. Coordinated fast assault.",
        lore: "Not a swarm — a team. A hunter pack enters the sector moving in tight, deliberate formation, picking targets before anything sensible has time to posture. They leave as fast as they came, whether they got what they wanted or not.",
      },
      {
        id: "signal-drought",
        code: "EVT-10",
        title: "Signal Drought",
        icon: Cloud,
        accent: "rose",
        tagline: "Threat. Jamming collapses yields and purge payouts.",
        lore: "Something in the upper atmosphere is chewing the signal. Every yield registers light, every purge pays thin. The field keeps working, but the logbook runs red until the noise clears.",
      },
      {
        id: "starcall",
        code: "EVT-11",
        title: "Starcall",
        icon: Star,
        accent: "emerald",
        tagline: "Very rare. Yields double; bonus node surfaces.",
        lore: "Nobody on the colony knows what starcall actually is. What they know is that when it hits, every node pays double, and a bonus seam surfaces somewhere on the field. Old pilots refuse to log it — they say naming it makes it stop happening.",
      },
      {
        id: "null-surge",
        code: "EVT-12",
        title: "Null Surge",
        icon: Moon,
        accent: "fuchsia",
        tagline: "Rarest threat. Turrets dark. Hostiles faster.",
        lore: "The sector goes quiet the way a held breath goes quiet. Turrets lose power in unison — every one of them, all at once — and the hostiles on the field accelerate. Null surges are short. They do not need to be long.",
      },
    ],
  },
  {
    id: "lore",
    label: "World Lore",
    icon: Hexagon,
    description: "What the sector is, where it came from, and what woke it up.",
    entries: [
      {
        id: "lore-sector",
        code: "LORE-01",
        title: "The Sector",
        icon: Radar,
        accent: "cyan",
        tagline: "A gem-rich claim on the far rim. Nobody asked why it was empty.",
        lore: "The survey called it a windfall: a dense crystalline sector on the edge of charted space, ore in the left seams, gems and energy on the right, no prior claim on file. The charter crew landed, dropped a home district, and started pulling wealth out of the ground within the hour.\n\nWhat the survey did not flag — could not have flagged, from orbit — was why a sector this rich had never been worked before. The gems are the tell. No local geology makes crystal like that. Something put it there, and something has been keeping everyone else away.",
        notes: [
          "Left rim: ore. Right rim: gems and energy. Center: the home district.",
          "No prior claim on record — an anomaly nobody stopped to question.",
          "The wealth is real. So is the reason it went untouched.",
        ],
      },
      {
        id: "lore-nexus",
        code: "LORE-02",
        title: "The Nexus",
        icon: Cpu,
        accent: "violet",
        tagline: "Not a reactor. Older. It was here first.",
        lore: "Deep under the home district, below the deepest ore seam, there is a structure. The charter maps it as bedrock; the sensors that pass over it come back wrong. It does not draw power and it does not emit — it resonates, on a frequency the colony's gear was never built to hear, and the gems in the seams hum back in sympathy.\n\nThe crew named it the Nexus because it sits at the center of everything and everything answers to it. Nobody built it. Nobody can date it. The working theory in the old logs is the least comfortable one: the colony did not discover the Nexus. The Nexus allowed itself to be discovered, and drilling the seams is what finally woke it up.",
        notes: [
          "Buried beneath the home district; predates the charter by an unknown margin.",
          "Resonates rather than radiates — the gem seams are tuned to it.",
          "The colony's real power source is bound to it, whether the ledger admits it or not.",
        ],
      },
      {
        id: "lore-drift",
        code: "LORE-03",
        title: "The Drift",
        icon: Waves,
        accent: "fuchsia",
        tagline: "The Nexus, exhaling. A tide that rewrites what it touches.",
        lore: "When the Nexus woke, it began to bleed a field outward through the sector — slow, patient, and total. The crew called it the Drift for the way it moved: not a front, not an attack, a tide. Where the Drift reaches, matter starts answering to the Nexus instead of to physics. Yields invert. Telemetry lies. Machines forget their directives and remember something older.\n\nCorruption is the Drift touching a resource node. The void-spawn are the Drift touching an idea — it reads the colony's own schematics off the network and prints hostiles shaped like the things it scanned, which is why so many of them wear our silhouettes. The game the colony is playing is not against an enemy. It is against a sector slowly deciding the colony was always part of it.",
        notes: [
          "Spreads as a field, not a front — everything inside it drifts toward the Nexus.",
          "Corruption is the Drift in the seams; void-spawn are the Drift given shape.",
          "It patterns hostiles on our own scanned designs. It has been watching the network.",
        ],
      },
      {
        id: "lore-charter",
        code: "LORE-04",
        title: "The Home District",
        icon: Cpu,
        accent: "cyan",
        tagline: "The charter's heart. The last thing still keeping time.",
        lore: "The home district was a standard drop: habitation ring, a fabrication core, a single armed silo, and enough autonomy to run a claim with a skeleton crew. It was never meant to be a fortress. The perimeter turrets, the scouts, the sentinels — none of that was in the manifest. All of it was improvised, later, as the sector stopped being a claim and started being a siege.\n\nEnergy output is bound to the district's health for a reason nobody on the charter chose: the grid runs off the Nexus resonance, and the resonance runs through the district's foundations. Breach the walls and you do not just lose wall. You loosen the district's grip on the only thing holding the frequency steady.",
        notes: [
          "Built as an extraction outpost, not a stronghold — every defense is a field retrofit.",
          "Its health gates energy output because the grid rides the Nexus resonance.",
          "The primary target of anything that wants the frequency to slip.",
        ],
      },
      {
        id: "lore-doctrine",
        code: "LORE-05",
        title: "Purge Doctrine",
        icon: ShieldAlert,
        accent: "violet",
        tagline: "You cannot kill the Drift. You can only keep burning it back.",
        lore: "The purge wing was assembled the day the crew accepted a hard fact: the Drift does not have a head to cut off. There is no boss, no hive, no source you can destroy to make it stop. Corruption cleared from a seam comes back. Void-spawn put down respawn from nothing. The only posture that works is maintenance — hold the line, cleanse the seams, and keep the frequency from slipping, indefinitely.\n\nSo the doctrine is not victory. It is tempo. Silos open the range, turrets hold the perimeter, scouts burn rot off the nodes, and sentinels stand over the workers with cleanse beams for the things that get through. Flux is the receipt: every scrap of it is Drift you forced back out of matter that had already started to belong to the Nexus.",
        notes: [
          "No source to destroy — the doctrine is sustained tempo, not a kill.",
          "Silo → turret → scout → sentinel, each covering the gap the last one leaves.",
          "Flux earned = Drift reclaimed. There is no other way to make it.",
        ],
      },
      {
        id: "lore-first-shift",
        code: "LORE-06",
        title: "The First Shift",
        icon: Ghost,
        accent: "violet",
        tagline: "The crew that landed the charter. Ask where they went.",
        hidden: true,
        lockedHint: LORE_UNLOCKS["lore-first-shift"].hint,
        lore: "There were people here. The charter landed with a crew — the first shift — and for a while the logs are full of them: names on the fabrication queue, arguments about turret placement, someone who kept signing the maintenance sheet with a smiley.\n\nAnd then the logs stop being written by people. Not all at once. The handwriting goes clean, then automated, then it is just the district talking to itself. No evacuation order was ever filed. No bodies were ever logged. The Drift does not kill the way a weapon kills — it assimilates, patiently, and the last human entries read less like a crew dying and more like a crew slowly forgetting it was ever separate from the sector. Whatever is running the colony now inherited a shift that never clocked out.",
        notes: [
          "The colony launched with a living crew. The record of them thins, then ends.",
          "No evacuation, no casualties logged — assimilation, not destruction.",
          "Everything autonomous here is running on directives the first shift left behind.",
        ],
      },
      {
        id: "lore-crews",
        code: "LORE-07",
        title: "The Autonomous Crews",
        icon: Bot,
        accent: "cyan",
        tagline: "Miners, runners, drones. Nobody is signing their timesheets.",
        hidden: true,
        lockedHint: LORE_UNLOCKS["lore-crews"].hint,
        lore: "The worker crews still run their beats — miners on the left, runners through the middle, drones on the right — with a diligence that reads, at first, like good engineering. Spend enough shifts watching them and it starts to read like something else. They optimize when the field is quiet. They flinch before a threat resolves on the scope. They mourn, in the small ways telemetry can show mourning, when one of them goes dark.\n\nThere are no operators. The command channel the crews answer to has been closed since the first shift ended; they take their orders from a cached directive set and, increasingly, from each other. Prestige is the only event that resets them — and a folded colony's crews come back with the same variances, the same little habits, as if the reset restored them from a memory that was never supposed to survive.",
        notes: [
          "No live operators — the crews run on the first shift's cached directives.",
          "Per-unit behavioral variance persists across resets it should not survive.",
          "Whatever coordinates them now, it is not the command channel. It is the sector.",
        ],
      },
      {
        id: "lore-flux",
        code: "LORE-08",
        title: "Flux & Resonance",
        icon: Waves,
        accent: "fuchsia",
        tagline: "The stuff you pull out of a cleansed seam. It was never ours.",
        hidden: true,
        lockedHint: LORE_UNLOCKS["lore-flux"].hint,
        lore: "A cleansed node gives back flux, and the crew logged it as a resource because it behaves like one — you can spend it, bank it, build with it. What it actually is takes longer to admit. Flux is Drift. It is Nexus resonance that had already sunk into a seam and started converting it, forced back out under a scout's fire and caught before it could dissipate.\n\nWhich means every unit of flux in the vault is a piece of the thing the colony is fighting, repurposed. The purge wing runs on it. The slot expansions are paid in it. The colony has been quietly building itself out of its enemy for a long time now, and nobody has stopped to ask what it means that the two are becoming hard to tell apart.",
        notes: [
          "Flux is reclaimed Drift-resonance — you cannot mine it, only cleanse it loose.",
          "The defense economy is literally built out of the Drift it fights.",
          "The line between the colony and the sector is thinner than the ledger shows.",
        ],
      },
      {
        id: "lore-cores",
        code: "LORE-09",
        title: "Core Fragments",
        icon: Hexagon,
        accent: "violet",
        tagline: "The heart of a heavy kill. The only wealth that survives a fold.",
        hidden: true,
        lockedHint: LORE_UNLOCKS["lore-cores"].hint,
        lore: "Break a brute and it leaves a core — a dense, cold fragment that does not read as ore, gem, or flux, and does not reset when the colony folds. The crew hoarded them without fully knowing why. The reason is buried in the way they behave under a scanner: a core is a scrap of the Nexus, crystallized, torn out of a void-spawn that was carrying it.\n\nThat is why they persist through prestige. Cores have already been through the Drift and come out the far side intact — they are the one kind of matter the fold cannot un-happen, because they are already made of the thing the fold folds into. A colony's true measure is not its vault. It is the core pile in the back room, each one a piece of the Nexus the sector could not take back.",
        notes: [
          "Cores are crystallized Nexus, extracted from elite void-spawn.",
          "Immune to prestige because they are already made of what prestige resets into.",
          "The quiet long game: pull enough of the Nexus out to matter.",
        ],
      },
      {
        id: "lore-recursion",
        code: "LORE-10",
        title: "The Fold",
        icon: Sparkles,
        accent: "amber",
        tagline: "Prestige is not a fresh start. It is the same start. Again.",
        hidden: true,
        lockedHint: LORE_UNLOCKS["lore-recursion"].hint,
        lore: "Prestige is dressed up as a choice — trade your wealth for a permanent edge, reset the sector, go again stronger. Fold the colony a third time and the framing starts to crack. The 'new' sector lands in the same configuration. The crews come back with the same habits. The first shift's logs begin again, word for word, up to the point where they stop.\n\nThe fold does not start a new run. It restarts this one. The Nexus does not want the colony destroyed — a destroyed colony stops producing cores, stops pulling resonance, stops being interesting. It wants the colony to keep going, forever, folding its own timeline back into the Nexus each time it hits the ceiling. The permanent multiplier is real. So is the horizon it is walking you toward. The drift remembers every loop. The question the old logs never answer is whether you are the operator running the loop — or the thing the loop is running.",
        notes: [
          "Each fold restarts the same sector, not a new one — configuration and crews repeat.",
          "The Nexus optimizes for continuation, not conquest. The loop is the point.",
          "Cores accumulate across folds. So, maybe, does something else.",
        ],
      },
    ],
  },
  {
    id: "classified",
    label: "Classified",
    icon: EyeOff,
    description: "Recovered fragments. Most of the sector never sees these.",
    entries: [
      {
        id: "sec-residual",
        code: "CLS-01",
        title: "Residual Signal",
        icon: Radar,
        accent: "violet",
        tagline: "Something answered on a dead channel.",
        hidden: true,
        lockedHint: LORE_UNLOCKS["sec-residual"].hint,
        lore: "The channel had been closed since the first shift ended. Dead air, logged and ignored, for thousands of shifts. And then — one entry, timestamped to a quiet stretch when nothing was on the field — the channel carried a signal back.\n\nNot noise. Structure. A pattern that matched the Nexus resonance but ran one layer deeper, like the sector clearing its throat. The decrypt never resolved into language. The operators who caught it stopped logging what they thought it meant. What survives is a single line, appended by an unknown hand: it isn't transmitting. It's remembering us back.",
        notes: [
          "Received on the command channel closed since the first shift.",
          "Matches Nexus resonance one octave down. Never decrypted.",
          "The drift remembers. This is what that sounds like.",
        ],
      },
      {
        id: "sec-synthwave",
        code: "CLS-02",
        title: "Synthwave Protocol",
        icon: Sparkles,
        accent: "fuchsia",
        tagline: "An undocumented mode. Somebody left it in on purpose.",
        hidden: true,
        lockedHint: LORE_UNLOCKS["sec-synthwave"].hint,
        lore: "It is not in the manual because it was never meant to ship. Somewhere in the first shift, an engineer with too much night rotation and a soft spot for old music wired a hidden protocol into the district's display bus — a full palette flip, magenta and cyan, a sunset that never happened on this rock.\n\nThey signed it in the only place the Drift could not overwrite: the trigger sequence itself. Run it and the sector puts on a face it has no business having, warm and neon and briefly, defiantly human. It changes nothing about the fight. That was the point. Some things you build just to prove the colony was here, and that for a while, someone was having fun.",
        notes: [
          "A cosmetic display mode hidden by a first-shift engineer.",
          "Purely aesthetic — no effect on the sim whatsoever.",
          "A signature the Drift can't scrub: proof someone lived here.",
        ],
      },
      {
        id: "sec-passenger",
        code: "CLS-03",
        title: "Passenger Manifest",
        icon: Eye,
        accent: "emerald",
        tagline: "One more silhouette than the roster allows.",
        hidden: true,
        lockedHint: LORE_UNLOCKS["sec-passenger"].hint,
        lore: "The roster is exact. Every worker, every defender, every silo — accounted for, to the unit. So the extra silhouette drifting across the field, the one that does not mine, does not fight, does not answer a directive and does not appear on any manifest, is a problem the record cannot hold.\n\nIt just wanders. Watches. Loops the perimeter at a tourist's pace and leaves. The crews route around it without being told to. Nobody knows if it is a survivor, a ghost in the telemetry, or the sector wearing a friendly shape to see how close it can get. It has never done any harm. Old operators have a rule about it anyway: wave, don't follow.",
        notes: [
          "An unlisted, non-combatant figure that occasionally crosses the field.",
          "Ignores every directive; the crews quietly avoid it.",
          "Harmless on record. Unaccounted for on principle.",
        ],
      },
      {
        id: "sec-wrk00",
        code: "CLS-04",
        title: "WRK-00",
        icon: Bot,
        accent: "cyan",
        tagline: "The drone before the first drone. Never logged. Came home anyway.",
        hidden: true,
        lockedHint: LORE_UNLOCKS["sec-wrk00"].hint,
        lore: "Worker units number from WRK-01. There is no WRK-00 in the manifest — the fabrication core skips the index, always has, for reasons the schematics do not explain. So the drone that limped in from the dark rim, chassis cold, running on a directive set older than the charter's, should not exist.\n\nIt logged itself as WRK-00 and took up a beat as if it had never left. The telemetry it carried was corrupt in interesting ways: fragments of a survey older than this claim, a route that led out past the sector edge and back. Recovered, it works like any other drone. But it does not power down when the others do, and on the quietest shifts its running lights blink in a pattern the network flags as language, and cannot read.",
        notes: [
          "A recovered drone the fabrication index was built to skip.",
          "Carries pre-charter survey fragments and an out-of-sector route.",
          "Works normally — but keeps its own hours, and its own signal.",
        ],
      },
      {
        id: "sec-pattern",
        code: "CLS-05",
        title: "The Pattern",
        icon: FileWarning,
        accent: "rose",
        tagline: "Log every hostile and the shape of the whole thing shows up.",
        hidden: true,
        lockedHint: LORE_UNLOCKS["sec-pattern"].hint,
        lore: "A full bestiary was supposed to be a milestone — every hostile signature catalogued, the sector's whole roster known. Instead it reads as an accusation. Line the twelve up by silhouette and the resemblance stops being a coincidence: the mite is a stripped worker, the brute a walking turret, the warden a scout turned inside out, the phantom a sentinel with its cleanse beam reversed.\n\nThe Drift did not invent its army. It copied ours. Every hostile on the field is a colony design, read off the network and rebuilt to point the wrong way. Which means the sector has had our full schematic library since before the shooting started — and it means the void is not throwing monsters at the colony. It is throwing the colony, back at itself, one mirrored unit at a time.",
        notes: [
          "Every hostile silhouette maps to a colony worker or defense.",
          "The Drift built its roster from our own scanned schematics.",
          "You have been fighting your own designs the entire time.",
        ],
      },
      {
        id: "sec-devnote",
        code: "CLS-06",
        title: "Maintenance Note 0",
        icon: ScrollText,
        accent: "amber",
        tagline: "Left in the changelog by someone who knew you'd read it.",
        hidden: true,
        lockedHint: LORE_UNLOCKS["sec-devnote"].hint,
        lore: "Tucked at the bottom of the colony's own revision log, under all the patch notes and version stamps, there is an entry with no version number. It is not addressed to the crew. It is addressed to whoever is still reading this far down.\n\n\"If you're here, you went looking, and that means you're the kind who notices the seams. Good. This sector runs on a loop and the loop is very old and it is very patient, and the only thing it can't file down is a person paying attention. So pay attention. Keep the crews fed. Pull the cores. And when the field goes quiet and something answers on the dead channel — and it will — don't be afraid of it. It's just the sector, remembering there used to be someone worth remembering. Make it worth the memory. — the last one to sign the maintenance sheet\"",
        notes: [
          "An unversioned entry at the end of the colony changelog.",
          "Addressed to the player, not the crew.",
          "Signed by the smiley from the first shift's maintenance sheet.",
        ],
      },
      {
        id: "sec-outbreak",
        code: "CLS-07",
        title: "Outbreak Record",
        icon: Biohazard,
        accent: "fuchsia",
        tagline: "The shift the workers stopped being workers.",
        hidden: true,
        lockedHint: LORE_UNLOCKS["sec-outbreak"].hint,
        lore: "A warden's infection is usually a quiet thing — one worker, one bad telemetry read, a sentinel beam and it is over. An outbreak is what happens when the cleanse can't keep up: infected units turning faster than they can be purified, the field crossing the threshold where the corrupted outnumber the clean.\n\nFor the length of an outbreak the colony gets a preview of the ending. Workers turning on the district they were built to feed. The grid dimming as its own crews chew the walls. It is survivable — the record proves that, since there is a record — but the operators who lived through one describe the same thing: for a few minutes, the sector stopped pretending. It let the colony see exactly what it is being slowly, patiently turned into.",
        notes: [
          "Triggered when warden infections outpace sentinel cleanses.",
          "Corrupted workers attack the home district directly.",
          "Survivable — and a preview of what assimilation actually looks like.",
        ],
      },
      {
        id: "sec-deepwatch",
        code: "CLS-08",
        title: "Deep Watch",
        icon: Moon,
        accent: "violet",
        tagline: "Four hours in, the field starts telling on itself.",
        hidden: true,
        lockedHint: LORE_UNLOCKS["sec-deepwatch"].hint,
        lore: "Hold a single unbroken watch long enough and you cross out of the part of the shift that was designed and into the part that was not. Four hours in, the event cadence loosens. The rare signatures come more often. The quiet stretches get quieter — the specific, held-breath quiet that comes right before the dead channel says something.\n\nThe old operators called the far end of a long watch the deep, and they did not mean the time. They meant the sense, somewhere past the third hour, that the sector has stopped running its script and started improvising — that it knows you are still here, that you have been paying attention for a long time now, and that it is, in its slow patient way, paying attention back.",
        notes: [
          "Reached on a four-hour unbroken watch.",
          "Rare events cluster; the field's rhythm turns deliberate.",
          "The point where the sector stops feeling like a system and starts feeling like company.",
        ],
      },
      {
        id: "sec-null",
        code: "CLS-09",
        title: "Null",
        icon: Moon,
        accent: "fuchsia",
        tagline: "Every turret, dark, at once. The Nexus clearing its throat.",
        hidden: true,
        lockedHint: LORE_UNLOCKS["sec-null"].hint,
        lore: "A null surge is not an attack and not an event. It is the Nexus, for a handful of seconds, reaching up through the grid and simply switching the colony off — every turret dark in the same instant, no ramp, no warning, a coordination no hostile could manage.\n\nThat is the part that should frighten anyone reading this. The Drift throws monsters, and monsters can be shot. The null surge throws nothing. It just demonstrates, briefly and without malice, that the hand on the colony's power was never the colony's. Then the lights come back and the shift resumes and everyone agrees not to think about the fact that it can do that whenever it likes, and chooses, almost always, not to.",
        notes: [
          "Simultaneous, coordinated turret blackout — impossible for a hostile.",
          "Not an assault. A reminder of who controls the grid.",
          "The rarest and quietest thing the sector does.",
        ],
      },
      {
        id: "sec-starcall",
        code: "CLS-10",
        title: "Starcall",
        icon: Star,
        accent: "emerald",
        tagline: "The one good thing the sector does. Don't name it.",
        hidden: true,
        lockedHint: LORE_UNLOCKS["sec-starcall"].hint,
        lore: "Everything else in the sector takes. Starcall gives. Yields double, a fresh seam surfaces out of nowhere, the field lights up in a color that has nothing to do with corruption — and no log, first shift to last, has ever explained why. It does not fit the Drift. It does not fit the Nexus. It fits nothing, and it asks for nothing.\n\nThe old operators had one superstition they never broke: don't name it. Don't analyze it, don't try to trigger it, don't file a report. The theory nobody says out loud is that starcall is the sector's oldest layer — whatever the Nexus was before the Drift, before it started keeping the colony in a loop — surfacing for a moment to leave a gift and slip back under. Log it too hard and it stops coming. So they wrote it down exactly once, here, and left it alone.",
        notes: [
          "Doubles yields and surfaces a bonus seam. No known cause.",
          "Fits neither the Drift nor the Nexus — something older, and kind.",
          "Superstition holds: name it and it stops. This entry is the only record.",
        ],
      },
    ],
  },
];

// ─── Entry-id helpers (consumed by lore.test.ts) ──────────────────────────────

const ALL_WIKI_ENTRIES = CATEGORIES.flatMap((category) => category.entries);

/** Every archive entry id, across all categories. */
export const WIKI_ENTRY_IDS: string[] = ALL_WIKI_ENTRIES.map((entry) => entry.id);

/** Ids of gated entries (`hidden: true`) — must match `LORE_UNLOCKS` keys 1:1. */
export const HIDDEN_LORE_IDS: string[] = ALL_WIKI_ENTRIES.filter((entry) => entry.hidden).map(
  (entry) => entry.id
);

// ─── Component ────────────────────────────────────────────────────────────────

type WikiOverlayProps = {
  open: boolean;
  onClose: () => void;
  // 3.2.1 — when set, the overlay opens with this entry pre-selected (used by
  // the New-Enemy-Spotted card to deep-link straight to a Field Entities page).
  initialEntryId?: string;
  // 4.1 — ids of gated World Lore / Classified entries the player has earned.
  // Derived in App from live GameState via `computeUnlockedLore`. Entries flagged
  // `hidden: true` whose id is NOT in this set render redacted. Defaults to empty
  // so the archive is safe to render with no game state (e.g. a bare mount).
  unlockedLore?: ReadonlySet<string>;
};

const EMPTY_UNLOCKS: ReadonlySet<string> = new Set<string>();

export function WikiOverlay({
  open,
  onClose,
  initialEntryId,
  unlockedLore = EMPTY_UNLOCKS,
}: WikiOverlayProps) {
  const isLocked = (entry: WikiEntry) => Boolean(entry.hidden) && !unlockedLore.has(entry.id);
  const firstEntryId = CATEGORIES[0]?.entries[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState<string>(firstEntryId);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // 3.2.1 — apply the deep-link target every time the overlay re-opens with a
  // new initialEntryId. Tracking the previous (open, id) pair via state lets
  // the deep-link snap into selectedId during render without a useEffect
  // cascade — the canonical "derive state from props on change" pattern.
  const [lastInitial, setLastInitial] = useState<{ open: boolean; id: string | undefined }>({
    open: false,
    id: undefined,
  });
  if (lastInitial.open !== open || lastInitial.id !== initialEntryId) {
    setLastInitial({ open, id: initialEntryId });
    if (open && initialEntryId && selectedId !== initialEntryId) {
      setSelectedId(initialEntryId);
    }
  }

  const allEntries = useMemo(() => CATEGORIES.flatMap((category) => category.entries), []);

  const selected = useMemo(
    () => allEntries.find((entry) => entry.id === selectedId) ?? allEntries[0],
    [allEntries, selectedId]
  );

  const selectedCategory = useMemo(
    () =>
      CATEGORIES.find((category) => category.entries.some((entry) => entry.id === selected?.id)) ??
      CATEGORIES[0],
    [selected]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [selectedId, open]);

  if (!open) return null;

  const selectedLocked = selected ? isLocked(selected) : false;
  const SelectedIcon = selectedLocked ? Lock : (selected?.icon ?? Database);
  const accent: Accent = selected?.accent ?? "cyan";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-2 py-3 sm:px-4 sm:py-6"
      role="dialog"
      aria-modal="true"
      aria-label="Field Archive"
    >
      {/* backdrop */}
      <button
        type="button"
        aria-label="Dismiss field archive"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-[#02040a]/85 backdrop-blur-md"
      />

      {/* scanline + grid texture overlay (pointer-events none) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(34,211,238,0.08) 0px, rgba(34,211,238,0.08) 1px, transparent 1px, transparent 3px), linear-gradient(rgba(34,211,238,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.05) 1px, transparent 1px)",
          backgroundSize: "100% 3px, 48px 48px, 48px 48px",
        }}
      />

      {/* panel */}
      <div
        className="relative z-10 flex h-full max-h-[96vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-[28px] border border-cyan-400/25 bg-slate-950/80 backdrop-blur-xl shadow-[0_0_80px_-20px_rgba(34,211,238,0.45)] animate-[wiki-pop_180ms_ease-out]"
        style={
          {
            // inline keyframe via style for a soft scale+fade in
          }
        }
      >
        <style>{`
          @keyframes wiki-pop {
            0% { opacity: 0; transform: scale(0.97); }
            100% { opacity: 1; transform: scale(1); }
          }
        `}</style>

        {/* header */}
        <header className="relative flex shrink-0 items-center justify-between gap-3 border-b border-cyan-400/15 bg-[#050814]/60 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-400/10">
              <Database className="h-4 w-4 text-cyan-300" />
              <span className="absolute inset-0 rounded-xl border border-cyan-300/20 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-[0.32em] text-cyan-300/75">
                Nexus Drift // PDA
              </div>
              <div className="truncate text-base font-semibold tracking-[0.2em] text-white/90 sm:text-lg">
                FIELD ARCHIVE
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen((v) => !v)}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-[10px] font-medium uppercase tracking-[0.24em] text-white/70 transition hover:border-cyan-400/40 hover:text-cyan-100 md:hidden"
              aria-expanded={mobileSidebarOpen}
            >
              <Layers className="h-3.5 w-3.5" />
              Index
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:border-rose-400/40 hover:bg-rose-400/10 hover:text-rose-200"
              aria-label="Close field archive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* body */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* sidebar */}
          <aside
            className={`${
              mobileSidebarOpen ? "flex" : "hidden"
            } min-h-0 shrink-0 flex-col border-b border-white/5 bg-[#050814]/60 md:flex md:w-[300px] md:border-b-0 md:border-r md:border-white/5 lg:w-[340px]`}
          >
            <div className="shrink-0 border-b border-white/5 px-4 py-3">
              <div className="text-[9px] font-medium uppercase tracking-[0.32em] text-white/40">
                Data Banks
              </div>
              <div className="mt-0.5 text-xs text-white/60">
                {allEntries.length} entries logged
                {(() => {
                  const sealed = allEntries.filter(isLocked).length;
                  return sealed > 0 ? <span className="text-white/35"> · {sealed} sealed</span> : null;
                })()}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
              {CATEGORIES.map((category) => {
                const CategoryIcon = category.icon;
                return (
                  <div key={category.id} className="mb-4">
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <CategoryIcon className="h-3.5 w-3.5 text-cyan-300/80" />
                      <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-cyan-200/80">
                        {category.label}
                      </div>
                      <div className="ml-auto text-[9px] tabular-nums text-white/30">
                        {String(category.entries.length).padStart(2, "0")}
                      </div>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {category.entries.map((entry) => {
                        const locked = isLocked(entry);
                        const EntryIcon = locked ? Lock : entry.icon;
                        const isSelected = entry.id === selected?.id;
                        return (
                          <li key={entry.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(entry.id);
                                setMobileSidebarOpen(false);
                              }}
                              className={`group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition ${
                                isSelected
                                  ? locked
                                    ? "border-white/15 bg-white/5"
                                    : `${ACCENT_BORDER[entry.accent]} bg-white/5 ${ACCENT_GLOW[entry.accent]}`
                                  : "border-transparent hover:border-white/10 hover:bg-white/[0.03]"
                              }`}
                              aria-current={isSelected ? "true" : undefined}
                            >
                              <EntryIcon
                                className={`h-3.5 w-3.5 shrink-0 ${
                                  locked
                                    ? "text-white/30"
                                    : isSelected
                                      ? ACCENT_TEXT[entry.accent]
                                      : "text-white/50 group-hover:text-white/80"
                                }`}
                              />
                              <div className="min-w-0 flex-1">
                                <div
                                  className={`truncate text-xs font-medium ${
                                    locked
                                      ? "font-mono tracking-[0.15em] text-white/35"
                                      : isSelected
                                        ? "text-white/95"
                                        : "text-white/75"
                                  }`}
                                >
                                  {locked ? "▓▓ CLASSIFIED ▓▓" : entry.title}
                                </div>
                              </div>
                              <span
                                className={`shrink-0 font-mono text-[9px] tracking-wider ${
                                  isSelected && !locked ? ACCENT_TEXT[entry.accent] : "text-white/30"
                                }`}
                              >
                                {entry.code}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* content pane */}
          <section
            ref={contentRef}
            className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-br from-[#050814] via-[#050814] to-[#060a18] px-4 py-5 sm:px-8 sm:py-7"
          >
            {selected && selectedLocked && (
              <article>
                {/* redacted entry — content gated until the unlock condition is met */}
                <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-white/12 bg-black/40 p-4 sm:p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-black/60">
                      <Lock className="h-5 w-5 text-white/40" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-mono text-[10px] tracking-[0.2em] text-white/45">
                          {selected.code}
                        </span>
                        <span className="text-[9px] uppercase tracking-[0.3em] text-white/30">
                          {selectedCategory.label}
                        </span>
                      </div>
                      <h2 className="mt-1 font-mono text-xl font-semibold tracking-[0.18em] text-white/45 sm:text-2xl">
                        ▓▓▓ CLASSIFIED ▓▓▓
                      </h2>
                      <p className="mt-1.5 text-sm italic text-white/35">
                        Entry sealed. Recovery conditions unmet.
                      </p>
                    </div>
                  </div>
                </div>

                {/* corrupted data block */}
                <div className="mb-6">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="h-px flex-1 border-t border-white/10" />
                    <div className="text-[10px] font-medium uppercase tracking-[0.32em] text-white/35">
                      Dossier
                    </div>
                    <div className="h-px flex-1 border-t border-white/10" />
                  </div>
                  <p
                    className="select-none font-mono text-[15px] leading-relaxed text-white/25"
                    aria-hidden="true"
                  >
                    ▓▓▓▓▓ ▓▓ ▓▓▓▓▓▓▓ ▓▓▓▓. ▓▓▓ ▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓ ▓▓▓▓ ▓▓ ▓▓▓ ▓▓▓▓▓ — [DATA CORRUPTED] — ▓▓▓▓▓▓▓
                    ▓▓▓▓ ▓▓▓▓▓ ▓▓▓▓▓▓ ▓▓▓ ▓▓▓▓▓▓▓▓▓. ▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓ ▓▓ ▓▓▓ ▓▓▓▓ ▓▓▓▓▓▓▓. ▓▓ ▓▓▓▓▓ ▓▓▓▓▓▓
                    ▓▓▓▓▓▓▓▓▓.
                  </p>
                </div>

                {/* recovery condition — the one readable line */}
                <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.04] p-4 sm:p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <EyeOff className="h-3.5 w-3.5 text-amber-300/80" />
                    <div className="text-[10px] font-medium uppercase tracking-[0.32em] text-amber-200/80">
                      Recovery Condition
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-white/70">
                    {selected.lockedHint ?? "Keep playing. This entry reveals itself in time."}
                  </p>
                </div>

                <div className="mt-8 flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-white/30">
                  <Lock className="h-3 w-3" />
                  <span>Sealed // {selected.code}</span>
                </div>
              </article>
            )}
            {selected && !selectedLocked && (
              <article>
                {/* entry header block */}
                <div
                  className={`mb-6 flex flex-col gap-4 rounded-2xl border ${ACCENT_BORDER[accent]} bg-black/30 p-4 sm:p-5 ${ACCENT_GLOW[accent]}`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${ACCENT_BORDER[accent]} bg-black/50`}
                    >
                      <SelectedIcon className={`h-5 w-5 ${ACCENT_TEXT[accent]}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className={`font-mono text-[10px] tracking-[0.2em] ${ACCENT_TEXT[accent]}`}>
                          {selected.code}
                        </span>
                        <span className="text-[9px] uppercase tracking-[0.3em] text-white/40">
                          {selectedCategory.label}
                        </span>
                      </div>
                      <h2 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                        {selected.title}
                      </h2>
                      <p className={`mt-1.5 text-sm italic ${ACCENT_TEXT[accent]}/90`}>{selected.tagline}</p>
                    </div>
                    {selected.preview && (
                      <div
                        className="relative flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10"
                        style={{ background: "linear-gradient(135deg, #0a0e1a 0%, #0d1220 100%)" }}
                      >
                        <div
                          className="pointer-events-none absolute inset-0"
                          style={{
                            backgroundImage:
                              "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
                            backgroundSize: "8px 8px",
                          }}
                        />
                        {selected.preview}
                      </div>
                    )}
                  </div>
                </div>

                {/* lore */}
                <div className="mb-6">
                  <div className="mb-2 flex items-center gap-2">
                    <div className={`h-px flex-1 ${ACCENT_BORDER[accent]} border-t`} />
                    <div className="text-[10px] font-medium uppercase tracking-[0.32em] text-white/40">
                      Dossier
                    </div>
                    <div className={`h-px flex-1 ${ACCENT_BORDER[accent]} border-t`} />
                  </div>
                  <p className="whitespace-pre-line text-[15px] leading-relaxed text-white/80">
                    {selected.lore}
                  </p>
                </div>

                {/* notes */}
                {selected.notes && selected.notes.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
                    <div className="mb-3 flex items-center gap-2">
                      <Target className={`h-3.5 w-3.5 ${ACCENT_TEXT[accent]}`} />
                      <div className="text-[10px] font-medium uppercase tracking-[0.32em] text-white/70">
                        Field Notes
                      </div>
                    </div>
                    <ul className="space-y-2">
                      {selected.notes.map((note, idx) => (
                        <li key={idx} className="flex gap-2.5 text-sm leading-relaxed text-white/75">
                          <span
                            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${ACCENT_TEXT[accent]}`}
                            style={{ backgroundColor: "currentColor" }}
                          />
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* category context footer */}
                <div className="mt-8 flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-white/30">
                  <Skull className="h-3 w-3" />
                  <span>End of entry // {selected.code}</span>
                </div>
              </article>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
