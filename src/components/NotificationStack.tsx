/**
 * 3.2.2 — Unified bottom-right notification stack.
 *
 * Renders the head of `state.notifications` (cap = NOTIFICATION_VISIBLE_LIMIT).
 * The stack is content-agnostic — kind dispatching lives in `NotificationCard`,
 * which routes a `Notification` discriminated union to a per-kind body. To
 * add a new toast type:
 *   1. Add a variant in `src/game/notifications.ts`.
 *   2. Add a builder + a render branch below.
 *
 * The component is presentational. Side effects (dismiss, action) flow back to
 * the host through `onDismiss` / `onAction`, which the host translates into
 * sim mutations via `mutateGame`.
 */

import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Award, AlertTriangle, BookOpen, X } from "lucide-react";
import { ACHIEVEMENT_DEFS } from "@/game/achievements";
import { NOTIFICATION_VISIBLE_LIMIT } from "@/game/notifications";
import type {
  AchievementNotification,
  EnemyDiscoveredNotification,
  Notification,
  NotificationTone,
} from "@/game/notifications";
import type { EnemyKind } from "@/game/types";

/**
 * Action descriptor surfaced from the stack to the host. Discriminated by
 * `kind` so future actions (e.g. open-achievements-modal) just add a new
 * variant; the host pattern-matches and routes.
 */
export type NotificationAction = { kind: "open-wiki"; entryId: string };

type Tone = {
  border: string;
  bg: string;
  glow: string;
  accent: string;
  badge: string;
  dot: string;
};

const TONE: Record<NotificationTone, Tone> = {
  common: {
    border: "border-white/20",
    bg: "bg-slate-900/85",
    glow: "shadow-[0_0_24px_-4px_rgba(255,255,255,0.18)]",
    accent: "text-white/90",
    badge: "bg-white/10 text-white/55",
    dot: "bg-white/55",
  },
  uncommon: {
    border: "border-cyan-300/40",
    bg: "bg-cyan-950/85",
    glow: "shadow-[0_0_28px_-4px_rgba(34,211,238,0.4)]",
    accent: "text-cyan-100",
    badge: "bg-cyan-900/55 text-cyan-200",
    dot: "bg-cyan-300",
  },
  rare: {
    border: "border-violet-300/45",
    bg: "bg-violet-950/85",
    glow: "shadow-[0_0_32px_-4px_rgba(167,139,250,0.5)]",
    accent: "text-violet-100",
    badge: "bg-violet-900/55 text-violet-200",
    dot: "bg-violet-300",
  },
  legendary: {
    border: "border-amber-300/60",
    bg: "bg-amber-950/85",
    glow: "shadow-[0_0_44px_-2px_rgba(251,191,36,0.7)]",
    accent: "text-amber-100",
    badge: "bg-amber-900/65 text-amber-200",
    dot: "bg-amber-300",
  },
  combat: {
    border: "border-rose-300/40",
    bg: "bg-rose-950/85",
    glow: "shadow-[0_0_28px_-4px_rgba(251,113,133,0.45)]",
    accent: "text-rose-100",
    badge: "bg-rose-900/55 text-rose-200",
    dot: "bg-rose-300",
  },
  void: {
    border: "border-fuchsia-300/45",
    bg: "bg-fuchsia-950/85",
    glow: "shadow-[0_0_28px_-4px_rgba(232,121,249,0.5)]",
    accent: "text-fuchsia-100",
    badge: "bg-fuchsia-900/55 text-fuchsia-200",
    dot: "bg-fuchsia-300",
  },
  info: {
    border: "border-sky-300/35",
    bg: "bg-sky-950/85",
    glow: "shadow-[0_0_24px_-4px_rgba(56,189,248,0.4)]",
    accent: "text-sky-100",
    badge: "bg-sky-900/55 text-sky-200",
    dot: "bg-sky-300",
  },
};

const ENEMY_INFO: Record<EnemyKind, { title: string; tagline: string }> = {
  mite: { title: "Mite", tagline: "Swarm unit. Smallest teeth. Lots of them." },
  raider: { title: "Raider", tagline: "Flanking predator. Leads the shot." },
  wisp: { title: "Wisp", tagline: "Ghost-class flanker. Barely there." },
  rusher: { title: "Rusher", tagline: "Glass cannon. Drone-hunter. Blinks in, gone." },
  brute: { title: "Brute", tagline: "Slow. Enormous. Takes the turrets with it." },
  sapper: { title: "Sapper", tagline: "Suicide ambusher. Dashes. Ends loudly." },
  leech: { title: "Leech", tagline: "Skips the fight. Goes for the vault." },
  phantom: { title: "Phantom", tagline: "Sentinel-assassin. Cloaks. Reappears behind you." },
  zapper: { title: "Zapper", tagline: "Range holder. Freezes the line." },
  corruptor: { title: "Corruptor", tagline: "Attaches to nodes. Rots them slowly. Never fights." },
  blight: { title: "Blight", tagline: "Heavy corruptor. Faster rot. Harder to burn off." },
  warden: { title: "Warden", tagline: "Does not fight. Infects. Vanishes." },
};

type Props = {
  notifications: readonly Notification[];
  onDismiss: (id: string) => void;
  onAction: (action: NotificationAction) => void;
};

export const NotificationStack = memo(function NotificationStack({
  notifications,
  onDismiss,
  onAction,
}: Props) {
  const visible = notifications.slice(0, NOTIFICATION_VISIBLE_LIMIT);

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-3 z-30 flex w-[min(340px,calc(100vw-1.5rem))] flex-col-reverse gap-2 lg:bottom-6 lg:right-6"
      role="region"
      aria-label="Notifications"
    >
      <AnimatePresence initial={false}>
        {visible.map((notification) => (
          <motion.div
            key={notification.id}
            layout
            initial={{ x: 64, opacity: 0, scale: 0.96 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 64, opacity: 0, scale: 0.96, transition: { duration: 0.22 } }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className="pointer-events-auto"
          >
            <NotificationCard
              notification={notification}
              onDismiss={() => onDismiss(notification.id)}
              onAction={onAction}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
});

function NotificationCard({
  notification,
  onDismiss,
  onAction,
}: {
  notification: Notification;
  onDismiss: () => void;
  onAction: (action: NotificationAction) => void;
}) {
  switch (notification.kind) {
    case "achievement":
      return <AchievementBody notification={notification} onDismiss={onDismiss} />;
    case "enemy-discovered":
      return (
        <EnemyDiscoveredBody
          notification={notification}
          onDismiss={onDismiss}
          onAction={onAction}
        />
      );
  }
}

function NotificationFrame({
  tone,
  ariaLabel,
  children,
}: {
  tone: Tone;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex h-[5.5rem] w-full items-start gap-3 rounded-2xl border ${tone.border} ${tone.bg} ${tone.glow} px-3 py-2.5 backdrop-blur`}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

function DismissButton({ onClick, accent }: { onClick: () => void; accent: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full bg-white/5 p-1 text-white/40 transition-colors hover:bg-white/10 hover:${accent}`}
      aria-label="Dismiss notification"
    >
      <X className="h-3 w-3" />
    </button>
  );
}

function AchievementBody({
  notification,
  onDismiss,
}: {
  notification: AchievementNotification;
  onDismiss: () => void;
}) {
  const tone = TONE[notification.tone];
  const def = ACHIEVEMENT_DEFS.find((entry) => entry.id === notification.achievementId);
  if (!def) return null;
  const rarityLabel =
    notification.tone === "legendary"
      ? "Legendary unlock"
      : notification.tone === "rare"
        ? "Rare unlock"
        : notification.tone === "uncommon"
          ? "Uncommon unlock"
          : "Achievement unlocked";

  return (
    <NotificationFrame tone={tone} ariaLabel={`Achievement unlocked: ${def.label}`}>
      <div className={`mt-0.5 shrink-0 ${tone.accent}`}>
        <Award className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`flex items-center gap-1.5 text-[9px] uppercase tracking-[0.22em] ${tone.badge.split(" ").slice(-1)[0]}`}
        >
          <span className={`h-1 w-1 rounded-full ${tone.dot}`} />
          {rarityLabel}
        </div>
        <div className={`mt-0.5 truncate text-sm font-semibold ${tone.accent}`}>{def.label}</div>
        <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/55">
          {def.description}
        </div>
      </div>
      <DismissButton onClick={onDismiss} accent="text-white/70" />
    </NotificationFrame>
  );
}

function EnemyDiscoveredBody({
  notification,
  onDismiss,
  onAction,
}: {
  notification: EnemyDiscoveredNotification;
  onDismiss: () => void;
  onAction: (action: NotificationAction) => void;
}) {
  const tone = TONE[notification.tone];
  const info = ENEMY_INFO[notification.enemyKind];

  return (
    <NotificationFrame tone={tone} ariaLabel={`New enemy spotted: ${info.title}`}>
      <div className={`mt-0.5 shrink-0 ${tone.accent}`}>
        <AlertTriangle className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`flex items-center gap-1.5 text-[9px] uppercase tracking-[0.22em] ${tone.badge.split(" ").slice(-1)[0]}`}
        >
          <span className={`h-1 w-1 rounded-full ${tone.dot}`} />
          New enemy spotted
        </div>
        <div className={`mt-0.5 truncate text-sm font-semibold ${tone.accent}`}>{info.title}</div>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[11px] leading-snug text-white/55">
            {info.tagline}
          </p>
          <button
            type="button"
            onClick={() => {
              onAction({ kind: "open-wiki", entryId: notification.enemyKind });
              onDismiss();
            }}
            className={`inline-flex shrink-0 items-center gap-1 rounded-full border ${tone.border} bg-white/5 px-2 py-0.5 text-[10px] font-medium ${tone.accent} transition-colors hover:bg-white/10`}
          >
            <BookOpen className="h-3 w-3" />
            View archive
          </button>
        </div>
      </div>
      <DismissButton onClick={onDismiss} accent="text-white/70" />
    </NotificationFrame>
  );
}
