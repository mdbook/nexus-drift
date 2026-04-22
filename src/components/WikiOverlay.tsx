import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
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
} from "lucide-react";

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
        lore:
          "Ore-line units built for the long haul. They drift out to the far rim of the left sector and grind on seams long after colony advisories ping yellow. Telemetry from recovered chassis shows an unusual rise in extraction rate during calm hours — like they enjoy the quiet.",
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
        lore:
          "The sector's middle belt belongs to Ops. They balance ore and flux hauls through the most trafficked corridors, which means they also catch most of the crossfire. Courage is moderate; panic-sprint protocols were added after the third lane-collapse incident.",
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
        lore:
          "Energy and gem seams live on the right rim, and Scout Drones inherited the beat. Their chassis hums with a passive corruption scanner — older pilots swear the drones pull back seconds before a void reading actually trips. Cautious to a fault, and the colony is better for it.",
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
        lore:
          "The first thing a new colony sees. Mites are crude void-spawn, barely shaped, barely intelligent — they pick a target and go. Alone, a non-event. In a column, they chew through unattended miners before anyone notices the lane.",
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
        lore:
          "Raiders don't charge — they arc. They read worker movement vectors and come in from the side, preferring miners who have wandered too far from a turret shadow. If a single drone goes dark on the rim, odds are a raider saw it go.",
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
        lore:
          "A smear of light on the grid, gone before the eye finishes parsing it. Wisps slip between turret cones at speeds the hardware struggles to resolve. The standard doctrine is don't track them — track where they haven't been yet, and wait.",
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
        lore:
          "Everything a rusher has goes into one straight line. It will ignore your turrets, your sentinels, your front line — and put a scout drone on the floor before anyone locks on. Once its sprint is spent, it folds like paper.",
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
        lore:
          "A mountain of plating around a void-slab heart. Brutes move at a crawl and do not care — they eat turret fire like weather and put themselves face-first into the perimeter. When one finally comes apart, the Core fragment it leaves behind is worth the damage.",
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
        lore:
          "Sappers aren't enemies so much as payloads with legs. They close range in a single committed dash and detonate against whatever structure they reach. If a perimeter turret disappears between frames, a sapper was there between frames.",
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
        lore:
          "Leeches ignore workers, turrets, sentinels — everything. They track straight for the home district and start draining gold and energy the moment they touch it. By the time a leech is on the wall, the sector economy is already bleeding.",
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
        lore:
          "Phantoms do not brawl. They drop cloak, reposition behind the line, and select a high-value target — usually a sentinel mid-cleanse. A shield layer buys them the seconds they need to recloak before return fire arrives.",
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
        lore:
          "Zappers hang back at the edge of engagement range and throw disable bolts into whichever asset looks most useful. A frozen turret is a silent turret; a frozen worker is a worker waiting to die. The disable is not long — it is only long enough.",
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
        lore:
          "Corruptors do not attack. They crawl onto a resource node, anchor, and begin the rot. Yields drop, then invert. Left alone, a single corruptor will hollow a gem seam before the next pay cycle. They are not dangerous — they are patient.",
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
        lore:
          "A corruptor that grew up. Blights carry more mass and more resistance — scout fire that would sear a standard corruptor only irritates a blight. Rot accelerates when they settle, and two blights on one seam can finish it before a purge team even arrives.",
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
        lore:
          "The thing you see in the corner of the scope and then can't find again. Wardens stalk individual workers for long minutes, never attacking, never drawing fire — and then the worker's telemetry goes wrong, and the warden is already somewhere else. Sentinels exist in large part because of them.",
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
        lore:
          "The ledger still runs on gold — a convention older than any of the gear pulling it out of the ground. Every upgrade, every perimeter, every new turret begins as a gold line in the logbook. When the vault runs dry, the colony runs quiet.",
      },
      {
        id: "ore",
        code: "RES-02",
        title: "Ore",
        icon: Pickaxe,
        accent: "amber",
        tagline: "Raw extraction material. The baseline pull.",
        lore:
          "Dense, grey, abundant, and almost never interesting on its own — ore is the filler that makes everything else possible. The left sector is nearly all ore seams, which is why the Auto Miners never stop walking.",
      },
      {
        id: "gems",
        code: "RES-03",
        title: "Gems",
        icon: Gem,
        accent: "cyan",
        tagline: "Crystalline rarity. Required to step up.",
        lore:
          "Crystalline formations that shouldn't, by any local geology, exist. Gems are the currency of prestige — of leaving this sector behind and stepping into the next. Colonies without gems stay colonies. Colonies with gems become something else.",
      },
      {
        id: "energy",
        code: "RES-04",
        title: "Energy",
        icon: Zap,
        accent: "cyan",
        tagline: "Power infrastructure. Falls with the city.",
        lore:
          "The colony's heartbeat. Energy output is modulated by the city's health — take a hit on the home district and the grid dims in real time. Everything with a sensor, a turret, or a beam is watching the energy line.",
      },
      {
        id: "cores",
        code: "RES-05",
        title: "Cores",
        icon: Hexagon,
        accent: "violet",
        tagline: "Fragments from elite kills. Do not reset.",
        lore:
          "Cores drop from brutes and other heavy voidspawn. They do not reset on prestige. They do not refund on teardown. A colony's true wealth isn't the gold in its vault — it's the core pile in the back room, hoarded through every reset.",
      },
      {
        id: "flux",
        code: "RES-06",
        title: "Flux",
        icon: Waves,
        accent: "fuchsia",
        tagline: "Resonance material. Only from fighting corruption.",
        lore:
          "Flux is what a cleansed node gives back. You cannot mine it. You cannot trade for it. The only way to earn flux is to burn corruption out of the seam that carries it — and that means feeding scouts, sentinels, and purge wings faster than the void can spread.",
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
        tagline: "Static perimeter gun. Reboots on hard hits.",
        lore:
          "Plain, proven, and endlessly repairable. Turrets do the unglamorous work of painting fire on anything that crosses the line. Sustained assault will break them, and the hull will reboot at half health — scarred, ready, already reacquiring.",
        notes: [
          "Breaks under concentrated pressure; reboots rather than dies.",
          "Lane coverage only; will not chase.",
          "Primary counter to mites, raiders, rushers.",
        ],
      },
      {
        id: "scout",
        code: "DEF-02",
        title: "Assault Scout",
        icon: Radar,
        accent: "cyan",
        tagline: "Mobile anti-corruption unit. Paired cleanses.",
        lore:
          "Scouts roam. They do not hold lanes — they hunt rot. When a node is heavily corrupted they pair up automatically, because one scout against a dug-in blight is a long, bad fight. Take damage and the scout breaks contact; we build replacements, not martyrs.",
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
        lore:
          "The sentinel is what you field when the sector has stopped being polite. It intercepts threats close to workers and carries a cleanse beam that does not kill so much as remove — infected workers walk away human, and the thing that was inside them does not walk away at all.",
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
        tagline: "Long-range strike. Slow. Heavy. Surgical.",
        lore:
          "The silo is patient. It watches the field, waits for the targets worth spending a warhead on, and then spends one. Brutes and leeches sit permanently at the top of its priority list — the silo exists to remove the threats nothing else can remove in time.",
        notes: [
          "Long range; slow reload cadence.",
          "Prioritises brutes and leeches.",
          "One clean hit ends most elite encounters.",
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
        lore:
          "Corruption is not a faction. It is a condition — the sector's slow answer to anyone who tries to extract from it. It moves through resource nodes, reduces yields, and does not burn off on its own. Active purge is the entire defence.",
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
        lore:
          "Every colony eventually reaches the ceiling of what this sector will give it. Prestige is the decision to fold — to trade accumulated wealth for a permanent multiplier on the next run. Requires extreme resource reserves; the colony that prestiges is the colony that could have kept going.",
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
        lore:
          "The sector watches. As the colony grows — upgrades, slots, prestige stacks — the void sends heavier envelopes in response. Tiers unlock enemy variants, not just more of the same. A quiet colony is a colony not yet seen.",
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
        lore:
          "Each worker kind starts with exactly one active unit and two dormant slots. Unlocking those slots takes both upgrade investment and sector advancement — the colony has to want them and deserve them. A recovered lost drone is the one recorded exception.",
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
        lore:
          "The home district is not a unit — it is the reason units exist. Uncontested incursions chew directly into its walls. Energy output is bound to its health, which makes every breach a two-layered wound: less wall, less grid. Keep it intact.",
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
        lore:
          "The sky lights up and the numbers follow. For a short window every node in the sector pays more — the kind of payout that turns a routine shift into a banner hour. Usually harmless. Usually.",
      },
      {
        id: "solar-flare",
        code: "EVT-02",
        title: "Solar Flare",
        icon: Sun,
        accent: "amber",
        tagline: "Mixed. Energy spikes, targeting suffers.",
        lore:
          "The grid sings, and the sensors scream. Energy pours in while targeting systems across the colony get noisy enough to miss shots that should not be missed. A profitable mess, if nothing heavy is already on the perimeter.",
      },
      {
        id: "cache-discovery",
        code: "EVT-03",
        title: "Cache Discovery",
        icon: PackageOpen,
        accent: "cyan",
        tagline: "Boon. A forgotten gem cache surfaces.",
        lore:
          "Somebody else's bad day, a long time ago. A buried gem cache ticks up through the regolith and onto the sector feed — bonus crystals, no effort, no catch. The colony takes the gift and does not ask.",
      },
      {
        id: "pirate-caravan",
        code: "EVT-04",
        title: "Pirate Caravan",
        icon: Swords,
        accent: "rose",
        tagline: "Mixed. Raiders arrive with loot on board.",
        lore:
          "Not a raid — a convoy. Pirate raiders come through the lanes carrying bonus cargo, and every one that drops pays extra on top of the standard bounty. The trade is straightforward: survive them, and profit.",
      },
      {
        id: "xeno-bloom",
        code: "EVT-05",
        title: "Xeno Bloom",
        icon: Biohazard,
        accent: "fuchsia",
        tagline: "Mixed. Corruption accelerates; purges pay triple flux.",
        lore:
          "The void exhales. Corruption spreads visibly faster across the sector — but every successful purge during the bloom returns triple flux. A fight worth having, if the purge wing is already standing.",
      },
      {
        id: "dust-storm",
        code: "EVT-06",
        title: "Dust Storm",
        icon: Wind,
        accent: "amber",
        tagline: "Mixed. Turret range collapses; enemies slow.",
        lore:
          "Visibility dies. Turret cones shrink to knife range, and every hostile on the grid wades through the same weather. A patient defence still wins this one; a sloppy defence loses the perimeter.",
      },
      {
        id: "echo-signal",
        code: "EVT-07",
        title: "Echo Signal",
        icon: Satellite,
        accent: "violet",
        tagline: "Rare. Elite-signature brute. Enormous core drop.",
        lore:
          "A ping from the far rim — old, huge, not in any known signature library. Whatever answers the ping answers as a brute, but bigger, slower, heavier. If it goes down, the core fragment it leaves behind funds half a prestige.",
      },
      {
        id: "core-breach",
        code: "EVT-08",
        title: "Core Breach",
        icon: AlertTriangle,
        accent: "rose",
        tagline: "Threat. Reactor shudders. Energy halved. Rot spreads.",
        lore:
          "The reactor does not fail — but it flinches. Energy output drops by half while engineers chase the fault, and in the gap corruption accelerates through every exposed seam. A bad time to run a thin line.",
      },
      {
        id: "hunter-pack",
        code: "EVT-09",
        title: "Hunter Pack",
        icon: Swords,
        accent: "rose",
        tagline: "Threat. Coordinated fast assault.",
        lore:
          "Not a swarm — a team. A hunter pack enters the sector moving in tight, deliberate formation, picking targets before anything sensible has time to posture. They leave as fast as they came, whether they got what they wanted or not.",
      },
      {
        id: "signal-drought",
        code: "EVT-10",
        title: "Signal Drought",
        icon: Cloud,
        accent: "rose",
        tagline: "Threat. Jamming collapses yields and purge payouts.",
        lore:
          "Something in the upper atmosphere is chewing the signal. Every yield registers light, every purge pays thin. The field keeps working, but the logbook runs red until the noise clears.",
      },
      {
        id: "starcall",
        code: "EVT-11",
        title: "Starcall",
        icon: Star,
        accent: "emerald",
        tagline: "Very rare. Yields double; bonus node surfaces.",
        lore:
          "Nobody on the colony knows what starcall actually is. What they know is that when it hits, every node pays double, and a bonus seam surfaces somewhere on the field. Old pilots refuse to log it — they say naming it makes it stop happening.",
      },
      {
        id: "null-surge",
        code: "EVT-12",
        title: "Null Surge",
        icon: Moon,
        accent: "fuchsia",
        tagline: "Rarest threat. Turrets dark. Hostiles faster.",
        lore:
          "The sector goes quiet the way a held breath goes quiet. Turrets lose power in unison — every one of them, all at once — and the hostiles on the field accelerate. Null surges are short. They do not need to be long.",
      },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

type WikiOverlayProps = {
  open: boolean;
  onClose: () => void;
};

export function WikiOverlay({ open, onClose }: WikiOverlayProps) {
  const firstEntryId = CATEGORIES[0]?.entries[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState<string>(firstEntryId);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const allEntries = useMemo(
    () => CATEGORIES.flatMap((category) => category.entries),
    []
  );

  const selected = useMemo(
    () => allEntries.find((entry) => entry.id === selectedId) ?? allEntries[0],
    [allEntries, selectedId]
  );

  const selectedCategory = useMemo(
    () =>
      CATEGORIES.find((category) =>
        category.entries.some((entry) => entry.id === selected?.id)
      ) ?? CATEGORIES[0],
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

  const SelectedIcon = selected?.icon ?? Database;
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
        style={{
          // inline keyframe via style for a soft scale+fade in
        }}
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
                        const EntryIcon = entry.icon;
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
                                  ? `${ACCENT_BORDER[entry.accent]} bg-white/5 ${ACCENT_GLOW[entry.accent]}`
                                  : "border-transparent hover:border-white/10 hover:bg-white/[0.03]"
                              }`}
                              aria-current={isSelected ? "true" : undefined}
                            >
                              <EntryIcon
                                className={`h-3.5 w-3.5 shrink-0 ${
                                  isSelected
                                    ? ACCENT_TEXT[entry.accent]
                                    : "text-white/50 group-hover:text-white/80"
                                }`}
                              />
                              <div className="min-w-0 flex-1">
                                <div
                                  className={`truncate text-xs font-medium ${
                                    isSelected ? "text-white/95" : "text-white/75"
                                  }`}
                                >
                                  {entry.title}
                                </div>
                              </div>
                              <span
                                className={`shrink-0 font-mono text-[9px] tracking-wider ${
                                  isSelected
                                    ? ACCENT_TEXT[entry.accent]
                                    : "text-white/30"
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
            {selected && (
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
                        <span
                          className={`font-mono text-[10px] tracking-[0.2em] ${ACCENT_TEXT[accent]}`}
                        >
                          {selected.code}
                        </span>
                        <span className="text-[9px] uppercase tracking-[0.3em] text-white/40">
                          {selectedCategory.label}
                        </span>
                      </div>
                      <h2 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">
                        {selected.title}
                      </h2>
                      <p className={`mt-1.5 text-sm italic ${ACCENT_TEXT[accent]}/90`}>
                        {selected.tagline}
                      </p>
                    </div>
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
                        <li
                          key={idx}
                          className="flex gap-2.5 text-sm leading-relaxed text-white/75"
                        >
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
