import packageJson from "../package.json";

export const CURRENT_VERSION = packageJson.version;

type ChangelogSection = {
  title: string;
  items: string[];
};

export type ChangelogEntry = {
  version: string;
  badge: string;
  summary: string;
  sections: ChangelogSection[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.1.4a",
    badge: "Field First",
    summary: "Layout overhaul for every screen size — the game field is now the focal point on mobile and desktop alike.",
    sections: [
      {
        title: "Layout",
        items: [
          "Game field is now the first thing below the title on mobile and vertical screens.",
          "Sector Level card moves below the fold on mobile so the field gets immediate focus.",
          "Resource pills, speed presets, and sidebar content follow the field on small screens.",
          "SVG field now fills its flex container properly — no more clipping on constrained viewports.",
          "Achievement badges moved inside the field card so they don't consume outer layout height.",
        ],
      },
      {
        title: "Desktop",
        items: [
          "Sector Level card collapses to a compact single-row bar at xl breakpoint.",
          "Description paragraph hidden on xl to recover vertical space for the field.",
          "Speed presets and New Game button integrated into the title row on xl.",
          "Max content width expanded to 1920px with wider gutters on large monitors.",
        ],
      },
    ],
  },
  {
    version: "0.1.4",
    badge: "Long Watch",
    summary: "Save persistence, day/night cycle, achievements, easter eggs, and idle-friendly UX polish.",
    sections: [
      {
        title: "Idle-Friendly",
        items: [
          "Colony state now saves to localStorage every 30 seconds and restores on reload.",
          "The simulation pauses cleanly when the tab is hidden, so returning does not trigger a catch-up burst.",
          "Speed presets (1x, 2x, 4x) are now visible in the main HUD instead of living only in the hidden admin panel.",
          "A 30-minute day/night cycle now shifts the battlefield sky over long runs.",
        ],
      },
      {
        title: "Achievements",
        items: [
          "Added 12 tracked achievements covering prestige, combat milestones, event coverage, and long-run survival.",
          "Unlocked achievements now appear in a ribbon under the resource bar and expand into a dedicated panel.",
          "Achievement state persists through save/load, including hidden unlocks.",
        ],
      },
      {
        title: "Easter Eggs",
        items: [
          "Konami code toggles a synthwave presentation mode.",
          "Typing drift anywhere in the app now wakes a hidden message in the log.",
          "A tourist drone can wander through mature colonies after a long enough real-time run.",
          "At high threat tiers, a lost drone can emerge from the outer zone and permanently join the roster.",
        ],
      },
      {
        title: "Polish",
        items: [
          "Workers now accumulate veteran ranks from nearby kills, gaining subtle movement speed bonuses and chevrons.",
          "Save migration backfills newly added fields so older local runs still load.",
        ],
      },
    ],
  },
  {
    version: "0.1.3",
    badge: "Deep Reserves",
    summary: "Two new resources, three new upgrade tracks, and Sentinel Mechs for the late-game.",
    sections: [
      {
        title: "New Resources",
        items: [
          "Flux: earned by cleansing corrupted nodes and killing Corruptors or Blights. Soft-caps at 200.",
          "Cores: dropped by Brutes, Phantoms, and Echo Signal elites. Spent on Sentinel and Archive upgrades.",
        ],
      },
      {
        title: "New Upgrades",
        items: [
          "Foundry (tier 3): boosts node yield by 12% per level. Costs Ore + Flux.",
          "Sentinel Mech (tier 5): deploys a heavy ground unit that hunts Brutes, Sappers, and Leeches. Costs Gold + Cores.",
          "Data Archive (tier 4): accelerates XP gain and increases prestige combo gain. Costs Flux + Cores.",
        ],
      },
      {
        title: "Economy",
        items: [
          "Flux now comes from scout cleanse ticks, node purge completions, and corruptor kills.",
          "Upgrade costs can now require multiple resource types instead of gold only.",
          "Autobuy now evaluates Flux and Cores affordability and can unlock Foundry and Sentinel paths.",
        ],
      },
    ],
  },
  {
    version: "0.1.2",
    badge: "Strange Tides",
    summary: "Six new enemy types, Cores drops, and a live random-event system reshape the mid-game.",
    sections: [
      {
        title: "New Enemies",
        items: [
          "Rusher (tier 3): fast straight-line darters that pressure turret clusters.",
          "Brute (tier 4): slow tank that absorbs turret fire and drops Core fragments.",
          "Sapper (tier 5): suicide unit that detonates near workers.",
          "Blight (tier 5): heavy corruptor variant that shrugs off scouts until arsenal level 3.",
          "Leech (tier 6): drains gold and energy when it slips near the home district.",
          "Phantom (tier 7): phases in and out of cloak, disappearing from turret targeting during its hidden window.",
        ],
      },
      {
        title: "Resources And Events",
        items: [
          "Added Cores to the resource state so late-game upgrade hooks can land without touching enemy logic again.",
          "Live event system now rolls seeded ambient modifiers and surprise encounters: Meteor Shower, Solar Flare, Cache Discovery, Pirate Caravan, Xeno Bloom, Dust Storm, and Echo Signal.",
          "Active timed events now surface in the HUD with countdown banners, and the admin panel can trigger each event manually for testing.",
        ],
      },
    ],
  },
  {
    version: "0.1.1",
    badge: "Slow Burn",
    summary: "Economy and drone rebalance. Slower pacing, weaker early drones, and cooperative cleanse synergy.",
    sections: [
      {
        title: "Balance",
        items: [
          "All upgrade growth rates increased — costs compound harder past level 15",
          "Ore income reduced; XP gain rate lowered for a longer mid-game",
          "Spawn intervals and wave budgets reduced — early game is calmer",
          "Prestige gates raised — prestige is now a meaningful milestone",
        ],
      },
      {
        title: "Anti-Corruption Drones",
        items: [
          "Drone movement speed roughly halved — they drift rather than zip",
          "Base cleanse rate halved; arsenal upgrades matter more",
          "Active drone cap starts at 2 (was 3); 4th active unlocks at scout level 8",
          "Multiple drones on the same corrupted node now cleanse faster (cooperative synergy)",
        ],
      },
    ],
  },
  {
    version: "0.1.0",
    badge: "Foundation",
    summary:
      "This is the first build that feels like it has a real spine. The sim is reproducible, the tuning lives in one place, and the code finally reads like something you can keep building on.",
    sections: [
      {
        title: "What Changed",
        items: [
          "Moved the game's balance knobs into balance.ts and used the cleanup to tune economy, corruption, scouts, turrets, and prestige pacing in one pass.",
          "Replaced Math.random() in the simulation with seeded Mulberry32 RNG, which makes long runs and odd bugs repeatable.",
          "Added the fourth scout unit so the late-game scout cap increase is backed by a real unit on the field.",
        ],
      },
      {
        title: "Under the Hood",
        items: [
          "Added a stricter production CSP plus ESLint and Prettier so the project is harder to break and easier to maintain.",
          "Split the old 953-line advanceGame.ts into focused subsystem files and pulled shared targeting logic into its own module.",
        ],
      },
    ],
  },
  {
    version: "0.0.8",
    badge: "Pressure Pass",
    summary:
      "This was the stop-the-late-game-from-wobbling release. Pressure still ramps, but it ramps in a way that feels fairer and easier to read.",
    sections: [
      {
        title: "Gameplay",
        items: [
          "Reworked progression and enemy counterplay so the colony doesn't swing as hard from panic to free farm.",
          "Fixed recovery mode and spawn pacing, which smoothed out the near-death breather loop that kept showing up in longer runs.",
          "Set clearer limits on anti-corruption scouts early on, then tuned around that cap.",
        ],
      },
      {
        title: "Polish",
        items: [
          "Tightened the scout marker silhouette so it stays readable once the screen gets busy.",
          "Lined up scout, worker, and turret home anchors so the field staging looks deliberate instead of a little off.",
        ],
      },
    ],
  },
  {
    version: "0.0.7",
    badge: "Homefront",
    summary:
      "The colony finally started to feel like a place instead of just a combat board. This is the release where the home district began to tell the story of the run.",
    sections: [
      {
        title: "World",
        items: [
          "Added evolving home district visuals and a procedural skyline.",
          "Slowed the building cadence so the city's growth reads as progression instead of flicker.",
          "Tied district growth to upgrades and turret investment so the skyline reflects how the colony is doing.",
        ],
      },
      {
        title: "Presentation",
        items: [
          "Simplified the field status footer so the center of the screen could breathe.",
          "Fixed the corruption status indicator so the HUD says what the sim is actually doing.",
        ],
      },
    ],
  },
  {
    version: "0.0.6",
    badge: "Visual Pass",
    summary:
      "This was the big readability pass. Enemy types became unmistakable, workers got their own silhouettes, and the whole battlefield stopped collapsing into one color soup.",
    sections: [
      {
        title: "Visual Identity",
        items: [
          "Gave mites, raiders, and wisps distinct shapes and a shared hostile ring, while pushing the colony into a cleaner cyan palette.",
          "Separated resource and corruption colors more aggressively, including a darker steel-grey ore tone that stopped fighting with the colony blue.",
        ],
      },
      {
        title: "Animation",
        items: [
          "Added wisp trails and dedicated harvesting animations for runners and drones.",
          "Rebuilt the runner grabber into a jointed arm with a proper pincher so it reads like a machine, not a tongue.",
        ],
      },
    ],
  },
  {
    version: "0.0.5",
    badge: "AI Pass",
    summary:
      "The sim started behaving better here, not just looking better. Workers made smarter calls, units gave each other room, and busy fights got easier to follow.",
    sections: [
      {
        title: "Decision Making",
        items: [
          "Reworked worker targeting with stronger role preferences, low-health node bias, and a real penalty for dogpiling the same target.",
          "Made the worker roles feel more distinct by sharpening what each unit wants to mine.",
        ],
      },
      {
        title: "Movement",
        items: [
          "Added post-movement separation for both workers and enemies so crowds stop collapsing into one pile.",
        ],
      },
    ],
  },
  {
    version: "0.0.4",
    badge: "Mobile Pass",
    summary:
      "This was the phone-and-layout cleanup release. The interface got less awkward on small screens, and the battlefield became a lot easier to read.",
    sections: [
      {
        title: "Mobile",
        items: [
          "Rebuilt the field card so the header and status blocks behave like real layout instead of floating overlays.",
          "Shortened the header treatment on small screens, centered the badges, and added a cleaner active-field indicator.",
          "Stopped resource nodes from spawning on top of each other.",
        ],
      },
    ],
  },
  {
    version: "0.0.3",
    badge: "Control Room",
    summary:
      "The shell of the game got a lot calmer here. Desktop layout stopped sprawling, the HUD read better, and there was finally a quick way to speed the sim up while tuning.",
    sections: [
      {
        title: "HUD",
        items: [
          "Capped the layout at 1600px, tightened spacing, and let the sidebar scroll on big screens without bloating the page.",
          "Added blurred label shadows and refreshed the top copy so the screen reads better at a glance.",
        ],
      },
      {
        title: "Tools and Feel",
        items: [
          "Added the hidden speed panel for quick pacing checks.",
          "Changed scout patrol and return movement to fixed-speed travel and added avoidance so they feel less twitchy.",
        ],
      },
    ],
  },
  {
    version: "0.0.2",
    badge: "Stability",
    summary:
      "A lot of invisible but important work landed here. The project stopped feeling fragile: CI existed, tests existed, and the build path finally matched the app.",
    sections: [
      {
        title: "Build and CI",
        items: [
          "Added GitLab CI for Docker builds and registry publishing, then fixed the install and build failures that showed up right after.",
          "Replaced the fake test script with Vitest and added the first batch of simulation invariant tests.",
        ],
      },
      {
        title: "Maintenance",
        items: [
          "Moved the game loop to requestAnimationFrame, tightened TypeScript settings, and cleaned up dead code.",
          "Added reduced-motion support, better progress bar accessibility, and sturdier Docker, Compose, and Nginx defaults.",
        ],
      },
    ],
  },
  {
    version: "0.0.1",
    badge: "Prototype",
    summary:
      "The first playable cut of Nexus Drift. Rough around the edges, but the core idea was already there: a colony that mostly runs itself while you keep the machine from drifting apart.",
    sections: [
      {
        title: "First Cut",
        items: ["Shipped the initial autonomous colony sim with mining, hostiles, upgrades, and the basic wallpaper feel."],
      },
    ],
  },
];
