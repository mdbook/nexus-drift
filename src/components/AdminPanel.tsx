import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ChevronDown, ChevronUp, Sparkles, Terminal, Wrench, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PANEL_CLASS } from "@/theme";
import { EVENT_DEFS } from "@/game/events/eventDefs";
import {
  ADMIN_COMMAND_HELP,
  type AdminCommandResult,
  type AdminSpeedPreset,
  executeAdminCommand,
} from "@/game/adminCommands";
import type { DerivedState, GameState } from "@/game/types";

type TerminalEntry = {
  id: number;
  tone: "system" | "input" | "success" | "error";
  text: string;
};

type AdminPanelProps = {
  game: GameState;
  derived: DerivedState;
  speed: number;
  synthwave: boolean;
  mutateGame: (updater: (draft: GameState) => void) => void;
  onSpeedSelect: (value: AdminSpeedPreset) => void;
  onShowPreviewBanner: () => void;
  onSynthwaveChange: (enabled: boolean) => void;
  onClose: () => void;
};

const QUICK_ACTIONS = [
  { label: "Midgame Setup", command: "preset midgame", tone: "cyan" },
  { label: "Late Game Setup", command: "preset lategame", tone: "cyan" },
  { label: "Siege Drill", command: "preset siege", tone: "rose" },
  { label: "Grant Bankroll", command: "grant all 50000", tone: "emerald" },
  { label: "Heal All", command: "heal all", tone: "emerald" },
  { label: "Cleanse Corruption", command: "clear corruption", tone: "violet" },
  { label: "Clear Threats", command: "clear enemies", tone: "amber" },
  { label: "Show Update Banner", command: "banner", tone: "emerald" },
] as const;

const TONE_CLASS: Record<(typeof QUICK_ACTIONS)[number]["tone"], string> = {
  amber: "border-amber-300/20 bg-amber-300/10 text-amber-100 hover:bg-amber-300/15",
  cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/15",
  emerald: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15",
  rose: "border-rose-300/20 bg-rose-300/10 text-rose-100 hover:bg-rose-300/15",
  violet: "border-violet-300/20 bg-violet-300/10 text-violet-100 hover:bg-violet-300/15",
};

function resultTone(result: AdminCommandResult): TerminalEntry["tone"] {
  return result.ok ? "success" : "error";
}

function terminalToneClass(tone: TerminalEntry["tone"]) {
  switch (tone) {
    case "input":
      return "text-cyan-100";
    case "success":
      return "text-emerald-100/90";
    case "error":
      return "text-rose-100/90";
    default:
      return "text-white/45";
  }
}

export function AdminPanel({
  game,
  derived,
  speed,
  synthwave,
  mutateGame,
  onSpeedSelect,
  onShowPreviewBanner,
  onSynthwaveChange,
  onClose,
}: AdminPanelProps) {
  const [input, setInput] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [entries, setEntries] = useState<TerminalEntry[]>([
    {
      id: 1,
      tone: "system",
      text: `Admin terminal ready. Type help. ${ADMIN_COMMAND_HELP.length} commands loaded.`,
    },
  ]);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const commandHistoryRef = useRef<string[]>([]);
  const nextEntryId = useRef(2);
  const terminalRef = useRef<HTMLDivElement>(null);

  const diagnostics = useMemo(() => {
    const liveEnemies = game.enemies.filter((enemy) => enemy.hp > 0).length;
    return [
      { label: "Speed", value: `${speed}x` },
      { label: "Tier", value: `${derived.progression.tier}` },
      { label: "Score", value: derived.progression.score.toFixed(1) },
      { label: "Enemies", value: `${liveEnemies}/${game.enemies.length}` },
      { label: "Events", value: `${game.activeEvents.length}` },
      { label: "City", value: `${Math.round(derived.cityIntegrity * 100)}%` },
    ];
  }, [
    derived.cityIntegrity,
    derived.progression.score,
    derived.progression.tier,
    game.activeEvents.length,
    game.enemies,
    speed,
  ]);

  useEffect(() => {
    const node = terminalRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [entries]);

  const appendEntries = (...nextEntries: Omit<TerminalEntry, "id">[]) => {
    setEntries((prev) =>
      [
        ...prev,
        ...nextEntries.map((entry) => ({
          ...entry,
          id: nextEntryId.current++,
        })),
      ].slice(-80)
    );
  };

  const runCommand = (command: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;

    let result: AdminCommandResult = { ok: false, message: "No command result." };
    mutateGame((next) => {
      result = executeAdminCommand(next, trimmed);
    });

    if (result.requestedSpeed !== undefined) {
      onSpeedSelect(result.requestedSpeed);
    }
    if (result.showPreviewBanner) {
      onShowPreviewBanner();
    }

    commandHistoryRef.current = [...commandHistoryRef.current, trimmed].slice(-30);
    setHistoryCursor(null);
    appendEntries(
      { tone: "input", text: `> ${trimmed}` },
      { tone: resultTone(result), text: result.message }
    );
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runCommand(input);
    setInput("");
  };

  const recallHistory = (direction: "previous" | "next") => {
    const history = commandHistoryRef.current;
    if (!history.length) return;

    if (direction === "previous") {
      const nextCursor = historyCursor === null ? history.length - 1 : Math.max(0, historyCursor - 1);
      setHistoryCursor(nextCursor);
      setInput(history[nextCursor] ?? "");
      return;
    }

    if (historyCursor === null) return;
    const nextCursor = historyCursor + 1;
    if (nextCursor >= history.length) {
      setHistoryCursor(null);
      setInput("");
      return;
    }
    setHistoryCursor(nextCursor);
    setInput(history[nextCursor] ?? "");
  };

  const commandInput = (
    <input
      value={input}
      onChange={(event) => setInput(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          recallHistory("previous");
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          recallHistory("next");
        }
      }}
      className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2 font-mono text-xs text-white outline-none transition placeholder:text-white/25 focus:border-cyan-200/35"
      placeholder="event list · spawn brute 3 · grant all 50000"
      aria-label={collapsed ? "Admin quick command" : "Admin command"}
    />
  );

  if (collapsed) {
    return (
      <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl lg:bottom-5">
        <Card
          className={`${PANEL_CLASS} relative overflow-visible border-cyan-300/15 bg-slate-950/92 px-3 pb-3 pt-4 shadow-[0_18px_70px_rgba(0,0,0,0.5)]`}
        >
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="absolute left-1/2 top-0 flex h-7 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-200/25 bg-slate-950 text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.16)] transition hover:bg-cyan-300/10"
            aria-label="Expand admin console"
          >
            <ChevronUp className="h-4 w-4" />
          </button>

          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-[10px] uppercase tracking-[0.26em] text-cyan-100/60">
              <Wrench className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Admin Console</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full border border-white/10 bg-white/5 p-2 text-white/45 transition hover:bg-white/10 hover:text-white"
              aria-label="Close admin console"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={submit} className="mt-3 flex gap-2">
            {commandInput}
            <button
              type="submit"
              className="rounded-2xl border border-cyan-200/25 bg-cyan-300/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-50 transition hover:bg-cyan-300/20"
            >
              Send
            </button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-6xl lg:bottom-5">
      <Card
        className={`${PANEL_CLASS} relative max-h-[82dvh] overflow-visible border-cyan-300/15 bg-slate-950/92 shadow-[0_24px_90px_rgba(0,0,0,0.55)]`}
      >
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="absolute left-1/2 top-0 z-10 flex h-7 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-cyan-200/25 bg-slate-950 text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.16)] transition hover:bg-cyan-300/10"
          aria-label="Collapse admin console"
        >
          <ChevronDown className="h-4 w-4" />
        </button>

        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3 md:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-cyan-100/55">
              <Wrench className="h-3.5 w-3.5" />
              <span>Admin Console</span>
            </div>
            <p className="mt-1 text-sm text-white/60">
              Extended speed presets are now in the main selector. Use tools or terminal commands for state
              setup.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-white/45 transition hover:bg-white/10 hover:text-white"
            aria-label="Close admin console"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid max-h-[calc(82dvh-72px)] min-h-0 gap-3 overflow-y-auto rounded-b-3xl p-3 md:p-4 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="min-w-0 space-y-3">
            <section className="rounded-3xl border border-white/10 bg-black/20 p-3">
              <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-white/40">
                <Activity className="h-3.5 w-3.5" />
                <span>Live Diagnostics</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {diagnostics.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2"
                  >
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">{item.label}</div>
                    <div className="mt-1 text-sm font-semibold text-white/85">{item.value}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-black/20 p-3">
              <div className="mb-3 text-[10px] uppercase tracking-[0.24em] text-white/40">Quick Actions</div>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.command}
                    type="button"
                    onClick={() => runCommand(action.command)}
                    className={`rounded-2xl border px-3 py-2 text-left text-xs font-medium transition ${TONE_CLASS[action.tone]}`}
                  >
                    <span className="block text-white/90">{action.label}</span>
                    <span className="mt-1 block font-mono text-[10px] text-white/40">{action.command}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-black/20 p-3">
              <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-white/40">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Shell Settings</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onSynthwaveChange(!synthwave)}
                  className={`rounded-2xl border px-3 py-2 text-xs font-medium transition ${
                    synthwave
                      ? "border-fuchsia-300/25 bg-fuchsia-300/15 text-fuchsia-50"
                      : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  Synthwave FX {synthwave ? "On" : "Off"}
                </button>
                <button
                  type="button"
                  onClick={onShowPreviewBanner}
                  className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:bg-emerald-300/15"
                >
                  Update Banner Preview
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-white/45">
                100x speed uses a catch-up cap to avoid one stalled frame trying to process an unbounded
                backlog.
              </p>
            </section>

            <section className="rounded-3xl border border-white/10 bg-black/20 p-3">
              <div className="mb-3 text-[10px] uppercase tracking-[0.24em] text-white/40">Trigger Event</div>
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                {EVENT_DEFS.map((eventDef) => (
                  <button
                    key={eventDef.id}
                    type="button"
                    onClick={() => runCommand(`event ${eventDef.id}`)}
                    className="shrink-0 rounded-full border border-cyan-300/15 bg-cyan-300/8 px-3 py-1.5 text-[11px] text-cyan-50/65 transition hover:border-cyan-200/25 hover:bg-cyan-300/14 hover:text-cyan-50"
                  >
                    {eventDef.label}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="flex min-w-0 flex-col rounded-3xl border border-cyan-300/15 bg-black/35">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-cyan-100/55">
                <Terminal className="h-3.5 w-3.5" />
                <span>Command Terminal</span>
              </div>
              <button
                type="button"
                onClick={() => runCommand("help")}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/45 transition hover:bg-white/10 hover:text-white"
              >
                Help
              </button>
            </div>

            <div
              ref={terminalRef}
              className="min-h-[220px] flex-1 overflow-y-auto px-3 py-3 font-mono text-xs leading-5"
            >
              {entries.map((entry) => (
                <pre
                  key={entry.id}
                  className={`whitespace-pre-wrap break-words ${terminalToneClass(entry.tone)}`}
                >
                  {entry.text}
                </pre>
              ))}
            </div>

            <div className="border-t border-white/10 p-3">
              <form onSubmit={submit} className="flex gap-2">
                {commandInput}
                <button
                  type="submit"
                  className="rounded-2xl border border-cyan-200/25 bg-cyan-300/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-50 transition hover:bg-cyan-300/20"
                >
                  Run
                </button>
              </form>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
