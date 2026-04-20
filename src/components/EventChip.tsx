import { useState } from "react";
import type { EventDef, EventEffectTone } from "@/game/events/eventDefs";
import type { ActiveEvent } from "@/game/types";

type Props = {
  event: ActiveEvent;
  def: EventDef | undefined;
};

const TONE_STYLE: Record<EventEffectTone, { chip: string; tooltipAccent: string; dot: string }> = {
  boon: {
    chip: "border-emerald-400/40 bg-emerald-900/40 text-emerald-100",
    tooltipAccent: "border-emerald-400/40",
    dot: "bg-emerald-300",
  },
  threat: {
    chip: "border-red-500/40 bg-red-950/50 text-red-100",
    tooltipAccent: "border-red-500/40",
    dot: "bg-red-400",
  },
  mixed: {
    chip: "border-yellow-600/50 bg-yellow-900/50 text-yellow-100",
    tooltipAccent: "border-yellow-500/40",
    dot: "bg-yellow-300",
  },
  neutral: {
    chip: "border-white/20 bg-white/5 text-white/80",
    tooltipAccent: "border-white/20",
    dot: "bg-white/55",
  },
};

const EFFECT_TEXT_TONE: Record<EventEffectTone, string> = {
  boon: "text-emerald-200",
  threat: "text-red-200",
  mixed: "text-yellow-200",
  neutral: "text-white/60",
};

export function EventChip({ event, def }: Props) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = hovered || focused;

  const tone = def?.tone ?? "neutral";
  const style = TONE_STYLE[tone];
  const secondsRemaining = Math.ceil(event.ticksRemaining / 30);
  const describedById = `event-chip-${event.id}`;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${style.chip} cursor-help focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-describedby={open ? describedById : undefined}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden />
        <span>{event.label}</span>
        <span className="text-white/55">({secondsRemaining}s)</span>
      </button>

      {open && (
        <div
          id={describedById}
          role="tooltip"
          className={`absolute bottom-full left-0 z-30 mb-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border ${style.tooltipAccent} bg-slate-950/95 p-3 text-left shadow-hud backdrop-blur-xl`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-semibold text-white">{def?.label ?? event.label}</div>
            <div className="shrink-0 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-white/60">
              {secondsRemaining}s
            </div>
          </div>
          {def?.flavor && (
            <p className="mt-1.5 text-xs italic leading-5 text-white/65">{def.flavor}</p>
          )}
          {def && def.effects.length > 0 && (
            <ul className="mt-2.5 space-y-1.5 border-t border-white/10 pt-2">
              {def.effects.map((effect) => (
                <li key={effect.text} className="flex items-start gap-2 text-xs leading-5">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      TONE_STYLE[effect.tone].dot
                    }`}
                    aria-hidden
                  />
                  <span className={EFFECT_TEXT_TONE[effect.tone]}>{effect.text}</span>
                </li>
              ))}
            </ul>
          )}
          {/* arrow — left-aligned under the chip button */}
          <span
            className={`absolute left-4 top-full h-2 w-2 -translate-y-1 rotate-45 border-b border-r bg-slate-950/95 ${style.tooltipAccent}`}
            aria-hidden
          />
        </div>
      )}
    </span>
  );
}
