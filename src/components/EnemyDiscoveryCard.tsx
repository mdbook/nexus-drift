import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, BookOpen, X } from "lucide-react";
import type { EnemyKind } from "@/game/types";

type Tone = {
  border: string;
  bg: string;
  glow: string;
  accent: string;
  dot: string;
};

const COMBAT_TONE: Tone = {
  border: "border-rose-300/40",
  bg: "bg-rose-950/85",
  glow: "shadow-[0_0_28px_-4px_rgba(251,113,133,0.5)]",
  accent: "text-rose-200",
  dot: "bg-rose-400",
};

const VOID_TONE: Tone = {
  border: "border-fuchsia-300/45",
  bg: "bg-fuchsia-950/85",
  glow: "shadow-[0_0_28px_-4px_rgba(232,121,249,0.55)]",
  accent: "text-fuchsia-200",
  dot: "bg-fuchsia-400",
};

const ENEMY_INFO: Record<EnemyKind, { title: string; tagline: string; tone: Tone }> = {
  mite: { title: "Mite", tagline: "Swarm unit. Smallest teeth. Lots of them.", tone: COMBAT_TONE },
  raider: { title: "Raider", tagline: "Flanking predator. Leads the shot.", tone: COMBAT_TONE },
  wisp: { title: "Wisp", tagline: "Ghost-class flanker. Barely there.", tone: COMBAT_TONE },
  rusher: { title: "Rusher", tagline: "Glass cannon. Drone-hunter. Blinks in, gone.", tone: COMBAT_TONE },
  brute: { title: "Brute", tagline: "Slow. Enormous. Takes the turrets with it.", tone: COMBAT_TONE },
  sapper: { title: "Sapper", tagline: "Suicide ambusher. Dashes. Ends loudly.", tone: COMBAT_TONE },
  leech: { title: "Leech", tagline: "Skips the fight. Goes for the vault.", tone: COMBAT_TONE },
  phantom: {
    title: "Phantom",
    tagline: "Sentinel-assassin. Cloaks. Reappears behind you.",
    tone: COMBAT_TONE,
  },
  zapper: { title: "Zapper", tagline: "Range holder. Freezes the line.", tone: COMBAT_TONE },
  corruptor: {
    title: "Corruptor",
    tagline: "Attaches to nodes. Rots them slowly. Never fights.",
    tone: VOID_TONE,
  },
  blight: { title: "Blight", tagline: "Heavy corruptor. Faster rot. Harder to burn off.", tone: VOID_TONE },
  warden: { title: "Warden", tagline: "Does not fight. Infects. Vanishes.", tone: VOID_TONE },
};

type Props = {
  kind: EnemyKind | undefined;
  onDismiss: () => void;
  onOpenWiki: (entryId: string) => void;
};

export const EnemyDiscoveryCard = memo(function EnemyDiscoveryCard({ kind, onDismiss, onOpenWiki }: Props) {
  return (
    <AnimatePresence>
      {kind ? <Card key={kind} kind={kind} onDismiss={onDismiss} onOpenWiki={onOpenWiki} /> : null}
    </AnimatePresence>
  );
});

function Card({
  kind,
  onDismiss,
  onOpenWiki,
}: {
  kind: EnemyKind;
  onDismiss: () => void;
  onOpenWiki: (entryId: string) => void;
}) {
  const info = ENEMY_INFO[kind];
  const tone = info.tone;
  return (
    <motion.div
      key={kind}
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -16, opacity: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      className={`pointer-events-auto fixed left-1/2 top-3 z-30 w-[min(420px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border ${tone.border} ${tone.bg} ${tone.glow} px-4 py-3 backdrop-blur-md sm:top-5`}
      role="status"
      aria-live="polite"
    >
      <div className={`flex items-center gap-1.5 text-[9px] uppercase tracking-[0.24em] ${tone.accent}`}>
        <AlertTriangle className="h-3 w-3" />
        New enemy spotted
        <span className={`ml-auto h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      </div>
      <div className={`mt-1 text-base font-semibold tracking-tight ${tone.accent}`}>{info.title}</div>
      <div className="mt-0.5 text-[12px] leading-snug text-white/65">{info.tagline}</div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onOpenWiki(kind)}
          className={`inline-flex items-center gap-1.5 rounded-full border ${tone.border} bg-white/5 px-3 py-1 text-[11px] font-medium ${tone.accent} transition-colors hover:bg-white/10`}
        >
          <BookOpen className="h-3 w-3" />
          View archive
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/55 transition-colors hover:bg-white/10 hover:text-white/80"
        >
          <X className="h-3 w-3" />
          Dismiss
        </button>
      </div>
    </motion.div>
  );
}
