import { motion } from "framer-motion";
import { useMemo } from "react";
import { makeStars } from "@/game/utils";

export function Background() {
  const stars = useMemo(() => makeStars(90), []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(70,110,255,0.16),transparent_35%),linear-gradient(180deg,rgba(5,8,20,1)_0%,rgba(7,10,28,1)_42%,rgba(6,10,22,1)_100%)]">
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div className="absolute inset-0 opacity-70">
        {stars.map((star) => (
          <motion.div
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
            }}
            animate={{
              opacity: [star.opacity * 0.35, star.opacity, star.opacity * 0.55],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 3 + (star.id % 5),
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      <motion.div
        className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-cyan-200/10 blur-3xl"
        animate={{ x: [0, 120, 0], y: [0, 40, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-blue-200/10 blur-3xl"
        animate={{ x: [0, -100, 0], y: [0, -60, 0] }}
        transition={{ duration: 31, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-10 left-1/3 h-64 w-64 rounded-full bg-fuchsia-300/10 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

