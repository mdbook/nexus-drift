import { LEAD_GESTURE } from "@/game/balance";

/**
 * 4.3.0 — pure tap-vs-hold decision for the press-and-hold "lead your workers"
 * gesture. A pointer press becomes a lead DRAG once it has been held for
 * `LEAD_GESTURE.holdMs` OR the pointer has moved `LEAD_GESTURE.moveThresholdPx`
 * (screen pixels) from its press origin. Below both, it is still a plain tap and
 * the caller lets the existing node-suggest / inspect click handlers fire.
 *
 * Extracted from FieldSvg so the threshold logic is unit-testable without a DOM.
 */
export function shouldEnterLeadMode(input: { heldMs: number; movedPx: number }): boolean {
  return input.heldMs >= LEAD_GESTURE.holdMs || input.movedPx >= LEAD_GESTURE.moveThresholdPx;
}
