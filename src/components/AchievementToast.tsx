import { memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Award } from "lucide-react";
import { ACHIEVEMENT_DEFS } from "@/game/achievements";
import type { AchievementRarity } from "@/game/achievements";
import type { AchievementToast as AchievementToastEntry } from "@/game/types";
import { useLowFxMode } from "@/hooks/useLowFxMode";

type RarityVisual = {
  label: string;
  border: string;
  bg: string;
  text: string;
  dot: string;
  badgeBg: string;
  badgeText: string;
  glow: string;
};

const RARITY_VISUALS: Record<AchievementRarity, RarityVisual> = {
  common: {
    label: "Common",
    border: "border-white/25",
    bg: "bg-slate-900/85",
    text: "text-white/90",
    dot: "bg-white/60",
    badgeBg: "bg-white/10",
    badgeText: "text-white/55",
    glow: "shadow-[0_0_24px_-4px_rgba(255,255,255,0.18)]",
  },
  uncommon: {
    label: "Uncommon",
    border: "border-cyan-300/40",
    bg: "bg-cyan-950/85",
    text: "text-cyan-100",
    dot: "bg-cyan-300",
    badgeBg: "bg-cyan-900/60",
    badgeText: "text-cyan-200",
    glow: "shadow-[0_0_28px_-4px_rgba(34,211,238,0.45)]",
  },
  rare: {
    label: "Rare",
    border: "border-violet-300/45",
    bg: "bg-violet-950/85",
    text: "text-violet-100",
    dot: "bg-violet-300",
    badgeBg: "bg-violet-900/60",
    badgeText: "text-violet-200",
    glow: "shadow-[0_0_32px_-4px_rgba(167,139,250,0.55)]",
  },
  legendary: {
    label: "Legendary",
    border: "border-amber-300/60",
    bg: "bg-amber-950/85",
    text: "text-amber-100",
    dot: "bg-amber-300",
    badgeBg: "bg-amber-900/70",
    badgeText: "text-amber-200",
    glow: "shadow-[0_0_44px_-2px_rgba(251,191,36,0.7)]",
  },
};

type Props = {
  toast: AchievementToastEntry | undefined;
};

export const AchievementToast = memo(function AchievementToast({ toast }: Props) {
  const lowFx = useLowFxMode();
  const def = useMemo(
    () => (toast ? ACHIEVEMENT_DEFS.find((entry) => entry.id === toast.id) : undefined),
    [toast]
  );

  return (
    <AnimatePresence>
      {toast && def ? <Toast key={toast.id} toast={toast} def={def} lowFx={lowFx} /> : null}
    </AnimatePresence>
  );
});

function Toast({
  toast,
  def,
  lowFx,
}: {
  toast: AchievementToastEntry;
  def: (typeof ACHIEVEMENT_DEFS)[number];
  lowFx: boolean;
}) {
  const visual = RARITY_VISUALS[toast.rarity];
  const isLegendary = toast.rarity === "legendary";

  if (isLegendary) {
    return (
      <motion.div
        key={toast.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.45 }}
        className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
        aria-live="polite"
      >
        {!lowFx ? (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.7, 0.55] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, times: [0, 0.4, 1] }}
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(251,191,36,0.32) 0%, rgba(251,191,36,0.12) 35%, rgba(0,0,0,0) 70%)",
            }}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse at center, rgba(251,191,36,0.18) 0%, rgba(0,0,0,0) 60%)",
            }}
          />
        )}
        <motion.div
          initial={{ scale: 0.85, y: 12, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.92, y: -12, opacity: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className={`pointer-events-none relative flex max-w-md flex-col items-center gap-2 rounded-3xl border-2 ${visual.border} ${visual.bg} ${visual.glow} px-7 py-5 backdrop-blur-md`}
        >
          <div
            className={`flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] ${visual.badgeText}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${visual.dot}`} />
            Legendary unlocked
            <span className={`h-1.5 w-1.5 rounded-full ${visual.dot}`} />
          </div>
          <div className={`flex items-center gap-3 ${visual.text}`}>
            <Award className="h-7 w-7" />
            <div className="text-2xl font-semibold tracking-tight">{def.label}</div>
          </div>
          <div className="max-w-sm text-center text-xs text-white/70">{def.description}</div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key={toast.id}
      initial={{ x: 48, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 48, opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className={`pointer-events-none fixed right-4 top-4 z-30 flex w-72 items-start gap-3 rounded-2xl border ${visual.border} ${visual.bg} ${visual.glow} px-3 py-2.5 backdrop-blur lg:right-6 lg:top-6`}
      role="status"
      aria-live="polite"
    >
      <div className={`mt-0.5 shrink-0 ${visual.text}`}>
        <Award className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`flex items-center gap-1.5 text-[9px] uppercase tracking-[0.22em] ${visual.badgeText}`}
        >
          <span className={`h-1 w-1 rounded-full ${visual.dot}`} />
          Achievement unlocked
        </div>
        <div className={`mt-0.5 truncate text-sm font-semibold ${visual.text}`}>{def.label}</div>
        <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/55">{def.description}</div>
        <div className="mt-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full ${visual.badgeBg} px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em] ${visual.badgeText}`}
          >
            <span className={`h-1 w-1 rounded-full ${visual.dot}`} />
            {visual.label}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
