import { MousePointerClick } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PANEL_CLASS } from "@/theme";

/**
 * 4.0 — first-run onboarding overlay. Shown once, gated on
 * `state.meta.v4OnboardingSeen` (persisted via the save schema). Dismissing it
 * flips the flag so it never reappears; loaded pre-4.0 saves migrate with the
 * flag already set, so returning players never see it.
 */
export function V4OnboardingCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Nexus Drift 4.0"
    >
      <button
        type="button"
        aria-label="Dismiss welcome"
        className="absolute inset-0 bg-[#02050f]/60 backdrop-blur-sm"
        onClick={onDismiss}
      />
      <Card className={`${PANEL_CLASS} relative w-full max-w-md border-cyan-300/20 bg-slate-950/95 p-5`}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-2">
            <MousePointerClick className="h-5 w-5 text-cyan-100" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-100/60">
              You are the operator
            </div>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Click upgrades to buy. Or flip Auto on and watch.
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/65">
              The colony is yours to run. Buy upgrades yourself from the sidebar, nudge workers by clicking
              resource nodes, and mark threats by clicking enemies. Prefer the old hands-off idle sim? Flip
              <span className="font-medium text-white/85"> Auto</span> to
              <span className="font-medium text-white/85"> All</span> (or hit
              <span className="font-medium text-white/85"> Idle Mode</span>) and let it play itself.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-4 w-full rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100 transition-colors hover:bg-cyan-300/20"
        >
          Got it
        </button>
      </Card>
    </div>
  );
}
