import { memo, useEffect, useState } from "react";
import { useTooltip } from "@/hooks/useTooltip";
import { TooltipPanel } from "@/components/Tooltip";
import type { EventDef, EventEffectTone } from "@/game/events/eventDefs";
import type { ActiveEvent } from "@/game/types";

type Props = {
  event: ActiveEvent;
  def: EventDef | undefined;
  inspected?: boolean;
  onInspect?: (eventId: ActiveEvent["id"]) => void;
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

export const EventChip = memo(function EventChip({ event, def, inspected = false, onInspect }: Props) {
  const tone = def?.tone ?? "neutral";
  const style = TONE_STYLE[tone];
  const secondsRemaining = Math.max(1, Math.ceil(event.ticksRemaining / 30));
  const isOneShotCard = !event.revertOnExpire;
  const oneShotFadeOpacity = isOneShotCard
    ? Math.max(0.28, Math.min(1, event.ticksRemaining / Math.max(1, def?.hudDurationTicks ?? event.ticksRemaining)))
    : 1;
  const [clickedFeedback, setClickedFeedback] = useState(false);
  const describedById = `event-chip-${event.id}`;
  const { open, triggerRef, triggerProps, anchor } = useTooltip(describedById, 256, "start");

  useEffect(() => {
    if (!clickedFeedback) return;
    const timeout = window.setTimeout(() => {
      setClickedFeedback(false);
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [clickedFeedback]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setClickedFeedback(true);
          onInspect?.(event.id);
        }}
        className={`relative overflow-hidden border text-xs font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/30 ${
          isOneShotCard
            ? `flex min-w-[168px] flex-col items-start gap-1 rounded-2xl px-3 py-2 text-left ${style.chip}`
            : `flex items-center gap-1.5 rounded-full px-2.5 py-0.5 ${style.chip}`
        } cursor-pointer`}
        style={isOneShotCard ? { opacity: oneShotFadeOpacity } : undefined}
        aria-pressed={inspected}
        {...triggerProps}
      >
        {isOneShotCard ? (
          <>
            <div className="flex w-full items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden />
              <span className="flex-1">{event.label}</span>
              {inspected && (
                <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-white/75">
                  Inspected
                </span>
              )}
            </div>
            <span
              className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-cyan-300/0 transition ${
                clickedFeedback ? "animate-pulse ring-cyan-300/60" : inspected ? "ring-cyan-300/20" : ""
              }`}
              aria-hidden
            />
          </>
        ) : (
          <>
            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden />
            <span>{event.label}</span>
            <span className="text-white/55">({secondsRemaining}s)</span>
            {inspected && <span className="text-cyan-200/90">•</span>}
            <span
              className={`pointer-events-none absolute inset-0 rounded-full ring-1 ring-cyan-300/0 transition ${
                clickedFeedback ? "animate-pulse ring-cyan-300/60" : inspected ? "ring-cyan-300/20" : ""
              }`}
              aria-hidden
            />
          </>
        )}
      </button>

      <TooltipPanel id={describedById} open={open} anchor={anchor} width={256} borderClass={style.tooltipAccent} arrowAlign="left">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <span>{def?.label ?? event.label}</span>
            {inspected && (
              <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-cyan-100">
                Inspected
              </span>
            )}
          </div>
          {!isOneShotCard && (
            <div className="shrink-0 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-white/60">
              {secondsRemaining}s
            </div>
          )}
        </div>
        {def?.flavor && (
          <p className="mt-1.5 text-xs italic leading-5 text-white/65">{def.flavor}</p>
        )}
        {def && def.effects.length > 0 && (
          <ul className="mt-2.5 space-y-1.5 border-t border-white/10 pt-2">
            {def.effects.map((effect) => (
              <li key={effect.text} className="flex items-start gap-2 text-xs leading-5">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${TONE_STYLE[effect.tone].dot}`}
                  aria-hidden
                />
                <span className={EFFECT_TEXT_TONE[effect.tone]}>{effect.text}</span>
              </li>
            ))}
          </ul>
        )}
      </TooltipPanel>
    </>
  );
});
