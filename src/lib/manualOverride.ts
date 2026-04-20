export type ManualOverrideSequence =
  | { stage: "idle" }
  | { stage: "await_reset"; startedAtMs: number };

export const INITIAL_MANUAL_OVERRIDE_SEQUENCE: ManualOverrideSequence = { stage: "idle" };

export function recordManualOverrideClick(
  sequence: ManualOverrideSequence,
  currentSpeed: number,
  nextSpeed: number,
  nowMs: number
): { sequence: ManualOverrideSequence; unlocked: boolean } {
  if (currentSpeed === 1 && nextSpeed === 4) {
    return {
      sequence: { stage: "await_reset", startedAtMs: nowMs },
      unlocked: false,
    };
  }

  if (sequence.stage === "await_reset" && currentSpeed === 4 && nextSpeed === 1) {
    const elapsedMs = nowMs - sequence.startedAtMs;
    return {
      sequence: INITIAL_MANUAL_OVERRIDE_SEQUENCE,
      unlocked: elapsedMs >= 10_000 && elapsedMs <= 60_000,
    };
  }

  return {
    sequence: INITIAL_MANUAL_OVERRIDE_SEQUENCE,
    unlocked: false,
  };
}
