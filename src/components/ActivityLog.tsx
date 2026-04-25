import { memo, useState } from "react";
import { Activity, Award, Biohazard, Bot, ChevronRight, Pickaxe, Radio, Swords, Zap } from "lucide-react";
import type { LogCategory, LogEntry } from "@/game/types";
import { ARCHIVE_LOG_CATEGORIES, TICK_MS } from "@/game/constants";
import { elapsedTicks } from "@/game/utils";

const ARCHIVE_FILTERS = new Set<LogCategory>(ARCHIVE_LOG_CATEGORIES);

type CategoryMeta = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  dot: string;
};

const CATEGORY_META: Record<LogCategory, CategoryMeta> = {
  system: {
    icon: Activity,
    label: "System",
    color: "text-cyan-300/90",
    dot: "bg-cyan-400",
  },
  combat: {
    icon: Swords,
    label: "Combat",
    color: "text-rose-300/90",
    dot: "bg-rose-400",
  },
  mining: {
    icon: Pickaxe,
    label: "Mining",
    color: "text-amber-300/90",
    dot: "bg-amber-400",
  },
  corruption: {
    icon: Biohazard,
    label: "Corruption",
    color: "text-fuchsia-300/90",
    dot: "bg-fuchsia-400",
  },
  event: {
    icon: Radio,
    label: "Event",
    color: "text-violet-300/90",
    dot: "bg-violet-400",
  },
  upgrade: {
    icon: Bot,
    label: "Upgrade",
    color: "text-emerald-300/90",
    dot: "bg-emerald-400",
  },
  achievement: {
    icon: Award,
    label: "Achievement",
    color: "text-yellow-300/90",
    dot: "bg-yellow-400",
  },
  ambient: {
    icon: Zap,
    label: "Ambient",
    color: "text-white/45",
    dot: "bg-white/30",
  },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_META) as LogCategory[];

// Visible filter tabs — omit ambient from tabs so it's always visible via "All"
// but can be hidden if you choose a specific category.
const FILTER_TABS: Array<{ key: LogCategory | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "combat", label: "Combat" },
  { key: "corruption", label: "Corrupt" },
  { key: "upgrade", label: "Upgrade" },
  { key: "event", label: "Event" },
  { key: "achievement", label: "Awards" },
];

function formatAge(currentTick: number, entryTick: number): string {
  // 3.1.3 audit follow-up: wrap-safe delta. state.timers.tick wraps at
  // TICK_WRAP; raw subtract can go negative for a window after wrap,
  // showing "now" or a bogus large age on pre-wrap entries.
  const deltaTicks = elapsedTicks(currentTick, entryTick);
  if (deltaTicks <= 0) return "now";
  const seconds = Math.round((deltaTicks * TICK_MS) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

type ActivityLogProps = {
  log: LogEntry[];
  archiveLog: LogEntry[];
  currentTick: number;
};

export const ActivityLog = memo(function ActivityLog({ log, archiveLog, currentTick }: ActivityLogProps) {
  const [activeFilter, setActiveFilter] = useState<LogCategory | "all">("all");

  // 3.2.1 — archival filters (upgrade / event / achievement) read from the
  // long-form archiveLog so players can scroll back further than the
  // 20-entry recent feed allows.
  const isArchiveFilter = activeFilter !== "all" && ARCHIVE_FILTERS.has(activeFilter);
  const sourceLog = isArchiveFilter ? archiveLog : log;
  const filtered =
    activeFilter === "all" ? log : sourceLog.filter((entry) => entry.category === activeFilter);

  return (
    <div className="mt-3 flex flex-col rounded-3xl border border-white/10 bg-white/5 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">Activity Log</div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
          </span>
          <div className="rounded-2xl bg-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-white/45">
            live
          </div>
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="mt-2.5 flex flex-wrap gap-1">
        {FILTER_TABS.map(({ key, label }) => {
          const isActive = activeFilter === key;
          const meta = key !== "all" ? CATEGORY_META[key] : null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveFilter(key)}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.18em] transition-colors ${
                isActive
                  ? "bg-white/15 text-white/90"
                  : "bg-white/5 text-white/35 hover:bg-white/10 hover:text-white/60"
              }`}
            >
              {meta && (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${isActive ? "opacity-100" : "opacity-50"}`}
                />
              )}
              {label}
            </button>
          );
        })}
        {/* Entry count badge */}
        <span className="ml-auto self-center text-[9px] text-white/25">
          {filtered.length}/{sourceLog.length}
        </span>
      </div>

      {/* Log entries */}
      <div className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto pr-0.5 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent]">
        {filtered.length === 0 && (
          <div className="py-4 text-center text-[11px] text-white/25">No entries in this category yet.</div>
        )}
        {filtered.map((entry, index) => {
          const meta = CATEGORY_META[entry.category];
          const Icon = meta.icon;
          const isNewest = index === 0;
          return (
            <div
              key={`${entry.tick}-${entry.category}-${index}`}
              className={`group flex items-start gap-2 rounded-2xl border px-3 py-2 transition-colors ${
                isNewest
                  ? "border-white/15 bg-white/8"
                  : "border-white/8 bg-black/20 hover:border-white/12 hover:bg-white/5"
              }`}
            >
              {/* Category icon */}
              <div className={`mt-0.5 shrink-0 ${meta.color}`}>
                <Icon className="h-3 w-3" />
              </div>

              {/* Message */}
              <div className="min-w-0 flex-1">
                <p className={`text-xs leading-snug ${isNewest ? "text-white/85" : "text-white/60"}`}>
                  {entry.message}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className={`h-0.5 w-0.5 rounded-full ${meta.dot} opacity-60`} />
                  <span className="text-[9px] uppercase tracking-[0.15em] text-white/25">{meta.label}</span>
                  <ChevronRight className="h-2 w-2 text-white/15" />
                  <span className="text-[9px] text-white/20">{formatAge(currentTick, entry.tick)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend — only show when filter is "all" */}
      {activeFilter === "all" && log.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-white/8 pt-2">
          {ALL_CATEGORIES.filter((cat) => log.some((e) => e.category === cat)).map((cat) => {
            const meta = CATEGORY_META[cat];
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveFilter(cat)}
                className="flex items-center gap-1 text-[9px] text-white/30 transition-colors hover:text-white/55"
              >
                <span className={`h-1 w-1 rounded-full ${meta.dot} opacity-70`} />
                {meta.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
