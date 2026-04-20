import { useState } from "react";
import {
  Award,
  Biohazard,
  ChevronRight,
  Eye,
  EyeOff,
  Pickaxe,
  Shield,
  Star,
  Swords,
  TrendingUp,
  X,
} from "lucide-react";
import { ACHIEVEMENT_DEFS } from "@/game/achievements";
import type { AchievementCategory, AchievementId, AchievementRarity } from "@/game/achievements";
import { Card } from "@/components/ui/card";
import { PANEL_CLASS } from "@/theme";

// ─── Rarity styling ───────────────────────────────────────────────────────────

type RarityMeta = {
  label: string;
  border: string;
  bg: string;
  text: string;
  dot: string;
  badgeBg: string;
  badgeText: string;
};

const RARITY_META: Record<AchievementRarity, RarityMeta> = {
  common: {
    label: "Common",
    border: "border-white/12",
    bg: "bg-white/5",
    text: "text-white/80",
    dot: "bg-white/40",
    badgeBg: "bg-white/10",
    badgeText: "text-white/50",
  },
  uncommon: {
    label: "Uncommon",
    border: "border-cyan-400/20",
    bg: "bg-cyan-900/15",
    text: "text-cyan-100/90",
    dot: "bg-cyan-400",
    badgeBg: "bg-cyan-900/40",
    badgeText: "text-cyan-300/80",
  },
  rare: {
    label: "Rare",
    border: "border-violet-400/25",
    bg: "bg-violet-900/20",
    text: "text-violet-100/90",
    dot: "bg-violet-400",
    badgeBg: "bg-violet-900/40",
    badgeText: "text-violet-300/80",
  },
  legendary: {
    label: "Legendary",
    border: "border-amber-400/30",
    bg: "bg-amber-900/20",
    text: "text-amber-100/90",
    dot: "bg-amber-400",
    badgeBg: "bg-amber-900/40",
    badgeText: "text-amber-300/90",
  },
};

// ─── Category styling ─────────────────────────────────────────────────────────

type CategoryMeta = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  activeClass: string;
};

const CATEGORY_META: Record<AchievementCategory | "all", CategoryMeta> = {
  all: { label: "All", icon: Award, activeClass: "bg-white/15 text-white/90" },
  combat: { label: "Combat", icon: Swords, activeClass: "bg-rose-900/40 text-rose-200" },
  corruption: { label: "Corruption", icon: Biohazard, activeClass: "bg-fuchsia-900/40 text-fuchsia-200" },
  mining: { label: "Mining", icon: Pickaxe, activeClass: "bg-amber-900/40 text-amber-200" },
  progression: { label: "Progression", icon: TrendingUp, activeClass: "bg-cyan-900/40 text-cyan-200" },
  survival: { label: "Survival", icon: Shield, activeClass: "bg-emerald-900/40 text-emerald-200" },
  secret: { label: "Secret", icon: Star, activeClass: "bg-violet-900/40 text-violet-200" },
};

const CATEGORY_TABS: Array<AchievementCategory | "all"> = [
  "all",
  "combat",
  "corruption",
  "mining",
  "progression",
  "survival",
  "secret",
];

// ─── Component ────────────────────────────────────────────────────────────────

type AchievementsModalProps = {
  achievements: Partial<Record<AchievementId, true>>;
  onClose: () => void;
};

export function AchievementsModal({ achievements, onClose }: AchievementsModalProps) {
  const [activeCategory, setActiveCategory] = useState<AchievementCategory | "all">("all");
  const [showHidden, setShowHidden] = useState(false);

  const unlockedCount = Object.keys(achievements).length;
  const totalCount = ACHIEVEMENT_DEFS.length;

  const filtered = ACHIEVEMENT_DEFS.filter((def) => {
    if (activeCategory !== "all" && def.category !== activeCategory) return false;
    // Hidden achievements: always show if unlocked; show placeholder if showHidden is off
    return true;
  });

  // Sort: unlocked first, then by rarity (legendary > rare > uncommon > common), then by label
  const RARITY_ORDER: Record<AchievementRarity, number> = {
    legendary: 0,
    rare: 1,
    uncommon: 2,
    common: 3,
  };

  const sorted = [...filtered].sort((a, b) => {
    const aUnlocked = !!achievements[a.id];
    const bUnlocked = !!achievements[b.id];
    if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;
    const rarityDiff = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
    if (rarityDiff !== 0) return rarityDiff;
    return a.label.localeCompare(b.label);
  });

  // Count by category for tab badges
  const countByCategory = (cat: AchievementCategory | "all") =>
    ACHIEVEMENT_DEFS.filter((def) => {
      if (cat !== "all" && def.category !== cat) return false;
      return !!achievements[def.id];
    }).length;

  const totalByCategory = (cat: AchievementCategory | "all") =>
    ACHIEVEMENT_DEFS.filter((def) => cat === "all" || def.category === cat).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6"
      onClick={onClose}
    >
      <Card
        className={`${PANEL_CLASS} flex w-full max-w-lg flex-col border-indigo-400/20 bg-slate-950/97 p-0 shadow-2xl`}
        style={{ maxHeight: "min(680px, 90vh)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-white">Achievements</h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-white/40">
              <span>{unlockedCount} / {totalCount} unlocked</span>
              <span className="h-1 w-1 rounded-full bg-white/20" />
              <span>{Math.round((unlockedCount / totalCount) * 100)}% complete</span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-1 w-48 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-500"
                style={{ width: `${(unlockedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              title={showHidden ? "Hide secret achievements" : "Reveal secret achievements"}
              className="rounded-full border border-white/10 bg-white/5 p-2 text-white/40 transition hover:bg-white/10 hover:text-white/70"
            >
              {showHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 bg-white/5 p-2 text-white/40 transition hover:bg-white/10 hover:text-white/70"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/8 px-4 py-2.5 [scrollbar-width:none]">
          {CATEGORY_TABS.map((cat) => {
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            const isActive = activeCategory === cat;
            const unlocked = countByCategory(cat);
            const total = totalByCategory(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] transition-colors ${
                  isActive ? meta.activeClass : "bg-white/5 text-white/35 hover:bg-white/10 hover:text-white/60"
                }`}
              >
                <Icon className="h-3 w-3" />
                <span>{meta.label}</span>
                <span className={`rounded-full px-1 text-[9px] ${isActive ? "bg-white/20" : "bg-white/8 text-white/30"}`}>
                  {unlocked}/{total}
                </span>
              </button>
            );
          })}
        </div>

        {/* Achievement list */}
        <div className="flex flex-col gap-1.5 overflow-y-auto px-4 py-3 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent]">
          {sorted.map((def) => {
            const unlocked = !!achievements[def.id];
            const isHidden = def.hidden && !unlocked;
            const meta = RARITY_META[def.rarity];

            if (isHidden && !showHidden) {
              // Render a masked placeholder for hidden locked achievements
              return (
                <div
                  key={def.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/3 px-3 py-2.5 opacity-50"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5">
                    <span className="text-sm text-white/20">?</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white/20">Hidden Achievement</div>
                    <div className="mt-0.5 text-xs text-white/15">Keep playing to discover this one.</div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={def.id}
                className={`flex items-start gap-3 rounded-2xl border px-3 py-2.5 transition-colors ${
                  unlocked
                    ? `${meta.border} ${meta.bg}`
                    : "border-white/8 bg-white/3 opacity-55"
                }`}
              >
                {/* Icon / check */}
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                    unlocked ? `${meta.border} ${meta.bg}` : "border-white/10 bg-white/5"
                  }`}
                >
                  {unlocked ? (
                    <span className={`text-sm ${meta.dot.replace("bg-", "text-")}`}>✓</span>
                  ) : (
                    <span className="text-sm text-white/20">○</span>
                  )}
                </div>

                {/* Text */}
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium ${unlocked ? meta.text : "text-white/30"}`}>
                    {def.label}
                  </div>
                  <div className={`mt-0.5 text-xs leading-snug ${unlocked ? "text-white/50" : "text-white/25"}`}>
                    {def.description}
                  </div>
                </div>

                {/* Rarity badge */}
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.15em] ${
                      unlocked ? `${meta.badgeBg} ${meta.badgeText}` : "bg-white/5 text-white/20"
                    }`}
                  >
                    {meta.label}
                  </span>
                  {def.hidden && (
                    <span className="flex items-center gap-0.5 text-[9px] text-white/25">
                      <Star className="h-2.5 w-2.5" />
                      secret
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {sorted.length === 0 && (
            <div className="py-8 text-center text-sm text-white/25">
              No achievements in this category yet.
            </div>
          )}
        </div>

        {/* Footer legend */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/8 px-5 py-3">
          {(Object.keys(RARITY_META) as AchievementRarity[]).map((r) => {
            const m = RARITY_META[r];
            return (
              <span key={r} className="flex items-center gap-1.5 text-[10px] text-white/35">
                <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                {m.label}
              </span>
            );
          })}
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="ml-auto flex items-center gap-1 text-[10px] text-white/30 transition hover:text-white/55"
          >
            {showHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {showHidden ? "Hide secrets" : "Reveal secrets"}
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </Card>
    </div>
  );
}
