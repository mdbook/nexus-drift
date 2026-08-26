# Nexus Drift — Player Guide

Welcome, operator. This is a friendly, no-spoilers guide to actually _playing_
Nexus Drift — what the game is, how the loop works, and (most importantly) how
you steer your colony. If you've ever tapped something and thought "did that do
anything?", the **Guiding your colony** section below is for you.

## What is Nexus Drift?

Nexus Drift is a sci-fi **colony sim**. You've landed a small autonomous mining
colony on a strange sector. Worker drones mine resources on their own, defenses
hold off waves of hostiles that crawl out of the Drift, and your colony slowly
grows in power — climbing through **tiers**, unlocking new workers, weapons, and
enemies, and eventually **prestiging** to loop the sector for permanent bonuses.

It runs as an **idle game** at heart: left completely alone, the colony mines,
fights, and grows by itself. But as of the 4.x updates, **you are the colony's
operator** — you can jump in and make the calls yourself whenever you want, then
step back and let it run.

## The core loop

1. **Workers mine.** Your drones automatically seek out resource nodes and haul
   in **gold** and **ore** (and later gems, energy, flux, and cores).
2. **You spend to grow.** Resources buy **upgrades** — more workers, faster
   mining, stronger weapons, a tougher city core.
3. **Defenses hold the line.** Missile silos open fire at long range, turrets
   backfill the perimeter, and scouts hunt corruption before it rots your
   economy.
4. **Score climbs, tiers unlock.** As your colony develops, its **score** rises
   and pulls you up through **tiers** — each one unlocking new upgrades, tougher
   enemies, and more of the map's story.
5. **Prestige loops the sector.** Once you're dominant, you can prestige: reset
   the run for a permanent bonus and climb again, faster each time.

You win by getting stronger. There's no lose screen — a bad wave sets you back,
it doesn't end the game.

## Guiding your colony (read this!)

Here's the part people miss. **The field is interactive — tap things on it.**
Everything you tap gives you visible feedback so you know it worked.

### Your commands run on ENERGY (and it's generous)

Your hands-on commands — nudging a worker to a node, marking a threat, recalling
a worker, and herding crews with a lead-drag — spend a little **energy**. Energy
refills on its own comfortably faster than normal play burns it, and you start
every colony with a reserve, so **you'll basically never run dry just playing.**
It only becomes a limit if you _mash_ commands — rapid-fire spamming will
temporarily bottom out your energy, and a command with nothing left to spend is
refused with a "Not enough energy" note in the log. Ease off for a moment and it
tops right back up. (Your **idle / autobuy** colony spends **zero** energy —
this only ever touches your own manual clicks.) Reactors boost energy income, so
if you love hands-on play, a few reactors keep the tank full.

### Send a worker to mine a specific node — TAP THE NODE

This is the big one. **Tap (or click) a resource node on the field, and the
nearest free worker is sent to mine it.** As of this version that's a **firm
order**, not a gentle suggestion: the worker **commits** to the node you picked
and stays on it — no more "I clicked that gold vein but it wandered off to a
different one." The **cyan line** drawn from a worker to the node is your proof
it's actually on its way, and it only appears when the worker is genuinely
heading there — so it never points you at a lie.

- **Click that node again to CANCEL.** Tapping a node a worker is already ordered
  to **calls the order off** and hands the worker back to normal AI — it's a
  toggle. A cancel is free (no energy). You can also hit **Cancel order** on the
  worker's inspect popover.
- **Amber ring, no line?** Your order is registered but the worker isn't on that
  path this instant — it's dodging a threat, being lead-dragged, or (for a node
  only a miner will brave) still waiting on the right worker. The ring flips back
  to the cyan line the moment the worker settles onto the node.
- **Safety still wins.** A firmly-ordered worker still bolts from real danger
  rather than marching into it — then **returns to finish the order** once it's
  clear. And if the ordered node turns corrupted under a non-miner, the order is
  cancelled automatically rather than walking it into the rot.
- On a **heavily corrupted node**, the order goes to the nearest **miner** (only
  miners will brave a corrupted node). If no miner is available, the tap is
  refused and costs no energy.
- If nothing happens and you see a "no eligible worker" note in the log, every
  worker is busy fleeing or rebooting right now — try again in a moment. (A "Not
  enough energy" note instead just means you've been spamming — see above.)

### Lead your workers around — PRESS AND HOLD, THEN DRAG

Want to physically herd your crews? **Press and hold anywhere on the field, then
drag.** A cyan **lead ring** appears where you're holding, and every nearby worker
gets pulled toward it — the closer a worker is, the harder it's tugged, so it feels
like a magnet. Drag the ring around and your crews stream after it; **let go and
they hand straight back to normal AI.** Works with a mouse or a finger (great on
iPad).

- A **quick tap** still does the normal thing (order a worker to a node, or open an
  inspect popover) — you only enter "lead" mode once you've **held** a moment or
  **dragged** a real distance, so ordinary taps (especially on touch) never get
  eaten into an accidental drag anymore.
- **It can't get stuck.** If a press ever loses track of your finger (you drag off
  the screen, switch tabs, etc.), the lead lets go on its own — no more whole crew
  frozen swarming a dead spot.
- **Fleeing still wins.** A worker running from a real threat ignores the pull —
  survival beats your finger. Hurt workers limping home to heal also sit it out.
- Use it to bunch idle crews onto a fresh vein, walk them away from a hot corner,
  or just gather everyone for a beat before releasing them.
- A held lead-drag slowly sips energy while you hold it; if you ever run the tank
  fully dry mid-drag it just lets go on its own. In normal use you won't notice.

### Inspect or recall a worker — TAP THE WORKER

Tap a worker drone to open its **inspect popover**. It shows what the worker is
doing right now — its current target and a one-line reason ("mining", "fleeing",
"spooked", "returning") — plus its HP.

- **Send home** button: a real, forced recall. The worker drops what it's doing
  and returns to the home pad (still dodging threats en route), then goes back to
  normal work once it arrives. Use it to pull a drone out of a hot zone.
- **Cancel order** button (shown only when this worker has a node order): calls off
  the "go mine that node" order and returns the worker to normal AI. Free — no
  energy. Same effect as clicking the ordered node again.

### Flag a threat — TAP THE ENEMY

Tap a hostile to inspect it — its type, HP, shield, and threat level. Hit
**Mark priority** and your weapons will _focus fire_ that enemy. A marked enemy
gets a persistent **amber ring** so you can see exactly what you flagged. The
mark now biases **every** weapon that can reach it — turrets, missile silos, and
sentinels.

- If the button is greyed out and reads **"No weapon can hit this,"** the enemy
  is out of range or cloaked from everything you've got — the game is being
  honest rather than letting you mark something nothing can shoot.

### Buy upgrades — TAP THE TILES

Upgrade tiles in the sidebar are clickable whenever you can afford them. Each
tile's tooltip explains any gate or shortfall ("needs Tier 2", "need 40 more
ore"). Buying is how you grow — early on, get miners and mining depth going so
your economy snowballs.

- A few high-value upgrades (**Reactor, Scout Arsenal, Missile Launcher**) also
  cost **gems** on top of gold — their tiles say "(costs gems)". Gems pile up fast
  from mining, so this is just something to spend them on, not a real roadblock.

### Hands-off? Flip on Idle Mode

Don't want to micromanage? Each upgrade has an **Auto** toggle, and the
**Idle Mode** switch flips _everything_ to autobuy at once. When it's on it
glows as a lit status indicator, and the colony buys, mines, and fights entirely
on its own — the classic idle experience. Flip it off any time to take the
controls back. It's a spectrum: fully manual, fully idle, or anywhere between.

## The Field Archive (lore + secrets)

Tap the **archive** button in the sidebar to open the **Field Archive** — the
in-game codex. It catalogs every worker, enemy, resource, defense, and event,
and it hides a **deep story layer**: the truth about the Nexus buried under your
colony, the Drift that spawns the hostiles, and what prestige's loop really is.

Many entries start **redacted** and unlock as you play — surviving long runs,
hitting milestones, discovering all the enemy types, and stumbling onto a handful
of well-hidden **easter eggs**. Poke around, play long, and watch the classified
files fill in. (Reading the in-game patch notes might just unlock one of them.)

## Quick tips

- **Early game:** pour into miners and mining depth first — economy snowballs.
- **See a cyan line?** A worker is en route to the node you nudged. An **amber
  ring on a node** means the order's registered but no worker can reach it yet
  (it'll go the moment one can); an **amber ring on an enemy** means that enemy is
  marked for focus fire.
- **On a tablet/phone:** everything is tuned for touch now — bigger tap targets,
  tap-to-open tooltips, no accidental zoom. Play on iPad comfortably.
- **Stuck or overwhelmed?** Flip on Idle Mode, watch a while, and learn the
  rhythm before taking the wheel again.

Good luck out there. The drift remembers.
