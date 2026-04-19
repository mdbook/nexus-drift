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
    version: CURRENT_VERSION,
    badge: "Current",
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
