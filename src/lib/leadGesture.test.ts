import { describe, expect, it } from "vitest";
import { LEAD_GESTURE } from "@/game/balance";
import { shouldEnterLeadMode } from "@/lib/leadGesture";

describe("shouldEnterLeadMode (tap vs hold disambiguation)", () => {
  it("stays a tap below both thresholds", () => {
    expect(
      shouldEnterLeadMode({ heldMs: LEAD_GESTURE.holdMs - 1, movedPx: LEAD_GESTURE.moveThresholdPx - 1 })
    ).toBe(false);
    expect(shouldEnterLeadMode({ heldMs: 0, movedPx: 0 })).toBe(false);
  });

  it("promotes to lead once held long enough (even with no movement)", () => {
    expect(shouldEnterLeadMode({ heldMs: LEAD_GESTURE.holdMs, movedPx: 0 })).toBe(true);
    expect(shouldEnterLeadMode({ heldMs: LEAD_GESTURE.holdMs + 50, movedPx: 0 })).toBe(true);
  });

  it("promotes to lead once moved far enough (even if quick)", () => {
    expect(shouldEnterLeadMode({ heldMs: 0, movedPx: LEAD_GESTURE.moveThresholdPx })).toBe(true);
    expect(shouldEnterLeadMode({ heldMs: 10, movedPx: LEAD_GESTURE.moveThresholdPx + 5 })).toBe(true);
  });

  it("4.5.0 de-twitch: an ordinary short tap (150ms / 8px jitter) stays a TAP", () => {
    // These are exactly the OLD 4.3.0 thresholds, which used to PROMOTE — the raised
    // 350ms / 14px de-twitch keeps a normal fingerpress a tap so the node-order /
    // inspect click lands instead of lurching every worker to the finger.
    expect(shouldEnterLeadMode({ heldMs: 150, movedPx: 8 })).toBe(false);
    expect(LEAD_GESTURE.holdMs).toBe(350);
    expect(LEAD_GESTURE.moveThresholdPx).toBe(14);
  });
});
