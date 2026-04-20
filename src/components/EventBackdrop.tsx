import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import type { ActiveEvent } from "@/game/types";

type Props = {
  activeEvents: ActiveEvent[];
};

type Particle = {
  id: number;
  x: number;
  y: number;
  delay: number;
  duration: number;
  size: number;
};

function makeParticles(count: number, seed: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i += 1) {
    // Deterministic-ish without pulling in the sim RNG; this is pure presentation.
    const r1 = Math.sin((seed + i) * 12.9898) * 43758.5453;
    const r2 = Math.sin((seed + i) * 78.233) * 43758.5453;
    const r3 = Math.sin((seed + i) * 37.719) * 43758.5453;
    const r4 = Math.sin((seed + i) * 94.673) * 43758.5453;
    out.push({
      id: i,
      x: (r1 - Math.floor(r1)) * 100,
      y: (r2 - Math.floor(r2)) * 100,
      delay: (r3 - Math.floor(r3)) * 4,
      duration: 3 + (r4 - Math.floor(r4)) * 5,
      size: 1 + ((r1 - Math.floor(r1)) * 3),
    });
  }
  return out;
}

/**
 * Renders a full-screen ambient effect overlay for each active event. Purely
 * presentational — does not touch sim state. Sits above the base Background
 * and below the main UI.
 */
export function EventBackdrop({ activeEvents }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const activeIds = useMemo(
    () => new Set(activeEvents.map((event) => event.id)),
    [activeEvents]
  );

  const meteorParticles = useMemo(() => makeParticles(22, 7), []);
  const xenoSpores = useMemo(() => makeParticles(30, 42), []);
  const dustMotes = useMemo(() => makeParticles(40, 91), []);
  const pirateStreaks = useMemo(() => makeParticles(5, 133), []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Meteor Shower — golden streaks + warm overlay */}
      {activeIds.has("meteor_shower") && (
        <div className="absolute inset-0">
          <motion.div
            className="absolute inset-0 bg-gradient-to-b from-amber-400/[0.08] via-transparent to-orange-500/[0.05]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
          />
          {!prefersReducedMotion &&
            meteorParticles.map((p) => (
              <motion.div
                key={`meteor-${p.id}`}
                className="absolute h-px w-16 origin-left bg-gradient-to-r from-transparent via-amber-200 to-orange-400"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y * 0.6}%`,
                  rotate: "35deg",
                  filter: "drop-shadow(0 0 4px rgba(251, 191, 36, 0.8))",
                }}
                animate={{
                  x: [0, 120, 240],
                  y: [0, 90, 180],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 1.4 + p.duration * 0.25,
                  delay: p.delay,
                  repeat: Infinity,
                  ease: "easeIn",
                }}
              />
            ))}
        </div>
      )}

      {/* Solar Flare — bright pulsing corona at top, warm color wash */}
      {activeIds.has("solar_flare") && (
        <div className="absolute inset-0">
          <motion.div
            className="absolute inset-0 bg-gradient-to-b from-yellow-300/[0.14] via-orange-400/[0.06] to-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.0 }}
          />
          <motion.div
            className="absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-yellow-300/20 blur-3xl"
            animate={
              prefersReducedMotion
                ? undefined
                : { scale: [1, 1.25, 1], opacity: [0.55, 0.85, 0.55] }
            }
            transition={
              prefersReducedMotion
                ? undefined
                : { duration: 4.5, repeat: Infinity, ease: "easeInOut" }
            }
          />
          {!prefersReducedMotion && (
            <motion.div
              className="absolute inset-0 bg-yellow-200/[0.04]"
              animate={{ opacity: [0, 0.3, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </div>
      )}

      {/* Cache Discovery — gentle green sparkle ping */}
      {activeIds.has("cache_discovery") && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-emerald-400/[0.06] via-transparent to-transparent"
          initial={{ opacity: 0 }}
          animate={
            prefersReducedMotion
              ? { opacity: 0.6 }
              : { opacity: [0.25, 0.6, 0.25] }
          }
          transition={
            prefersReducedMotion
              ? { duration: 0.8 }
              : { duration: 5, repeat: Infinity, ease: "easeInOut" }
          }
        />
      )}

      {/* Pirate Caravan — red perimeter alert vignette + streaks */}
      {activeIds.has("pirate_caravan") && (
        <div className="absolute inset-0">
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center, transparent 45%, rgba(220,38,38,0.18) 100%)",
            }}
            animate={
              prefersReducedMotion ? undefined : { opacity: [0.55, 0.9, 0.55] }
            }
            transition={
              prefersReducedMotion
                ? undefined
                : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
            }
          />
          {!prefersReducedMotion &&
            pirateStreaks.map((p) => (
              <motion.div
                key={`pirate-${p.id}`}
                className="absolute h-px w-24 bg-gradient-to-r from-transparent via-red-400/80 to-transparent"
                style={{ left: `${p.x}%`, top: `${30 + p.y * 0.4}%` }}
                animate={{ x: [-200, 1600], opacity: [0, 1, 0] }}
                transition={{
                  duration: 2.4 + p.duration * 0.2,
                  delay: p.delay,
                  repeat: Infinity,
                  ease: "linear",
                }}
              />
            ))}
        </div>
      )}

      {/* Xeno Bloom — violet fog + drifting spores */}
      {activeIds.has("xeno_bloom") && (
        <div className="absolute inset-0">
          <motion.div
            className="absolute inset-0 bg-gradient-to-t from-fuchsia-600/[0.12] via-purple-500/[0.06] to-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4 }}
          />
          <motion.div
            className="absolute -bottom-32 left-1/4 h-[420px] w-[420px] rounded-full bg-fuchsia-500/15 blur-3xl"
            animate={
              prefersReducedMotion
                ? undefined
                : { x: [0, 60, 0], scale: [1, 1.15, 1] }
            }
            transition={
              prefersReducedMotion
                ? undefined
                : { duration: 8, repeat: Infinity, ease: "easeInOut" }
            }
          />
          <motion.div
            className="absolute -bottom-20 right-1/4 h-[360px] w-[360px] rounded-full bg-purple-500/12 blur-3xl"
            animate={
              prefersReducedMotion
                ? undefined
                : { x: [0, -50, 0], scale: [1, 1.1, 1] }
            }
            transition={
              prefersReducedMotion
                ? undefined
                : { duration: 10, repeat: Infinity, ease: "easeInOut" }
            }
          />
          {!prefersReducedMotion &&
            xenoSpores.map((p) => (
              <motion.div
                key={`spore-${p.id}`}
                className="absolute rounded-full bg-fuchsia-300"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: p.size,
                  height: p.size,
                  filter: "drop-shadow(0 0 6px rgba(232, 121, 249, 0.9))",
                }}
                animate={{
                  y: [0, -40, 0],
                  x: [0, 20, 0],
                  opacity: [0.15, 0.8, 0.15],
                }}
                transition={{
                  duration: 4 + p.duration,
                  delay: p.delay,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            ))}
        </div>
      )}

      {/* Dust Storm — amber haze + horizontal blowing motes */}
      {activeIds.has("dust_storm") && (
        <div className="absolute inset-0">
          <motion.div
            className="absolute inset-0 bg-gradient-to-b from-amber-700/[0.10] via-yellow-600/[0.08] to-amber-900/[0.12]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4 }}
          />
          {!prefersReducedMotion && (
            <motion.div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(90deg, rgba(251,191,36,0.04) 0, rgba(251,191,36,0.04) 2px, transparent 2px, transparent 8px)",
              }}
              animate={{ x: [0, -120] }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            />
          )}
          {!prefersReducedMotion &&
            dustMotes.map((p) => (
              <motion.div
                key={`dust-${p.id}`}
                className="absolute rounded-full bg-amber-200/60"
                style={{
                  top: `${p.y}%`,
                  left: `${p.x}%`,
                  width: p.size,
                  height: p.size,
                }}
                animate={{ x: [-40, 1700], opacity: [0, 0.7, 0] }}
                transition={{
                  duration: 3 + p.duration * 0.5,
                  delay: p.delay,
                  repeat: Infinity,
                  ease: "linear",
                }}
              />
            ))}
        </div>
      )}

      {/* Echo Signal — sharp red scanner ring */}
      {activeIds.has("echo_signal") && (
        <div className="absolute inset-0">
          <motion.div
            className="absolute inset-0 bg-gradient-to-br from-red-900/[0.10] via-transparent to-red-900/[0.10]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          />
          {!prefersReducedMotion && (
            <>
              <motion.div
                className="absolute left-1/2 top-1/2 rounded-full border-2 border-red-500/40"
                style={{ translateX: "-50%", translateY: "-50%" }}
                animate={{
                  width: [40, 1600],
                  height: [40, 1600],
                  opacity: [0.7, 0],
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeOut" }}
              />
              <motion.div
                className="absolute left-1/2 top-1/2 rounded-full border border-red-400/50"
                style={{ translateX: "-50%", translateY: "-50%" }}
                animate={{
                  width: [20, 1200],
                  height: [20, 1200],
                  opacity: [0.6, 0],
                }}
                transition={{
                  duration: 4,
                  delay: 1.3,
                  repeat: Infinity,
                  ease: "easeOut",
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
