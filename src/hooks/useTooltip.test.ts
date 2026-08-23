import { describe, expect, it } from "vitest";
import { isTapPointer } from "./useTooltip";

describe("isTapPointer", () => {
  it("treats touch and pen as tap-toggle pointers", () => {
    expect(isTapPointer("touch")).toBe(true);
    expect(isTapPointer("pen")).toBe(true);
  });

  it("leaves mouse to the hover path (no tap toggle)", () => {
    expect(isTapPointer("mouse")).toBe(false);
    expect(isTapPointer("")).toBe(false);
    expect(isTapPointer("unknown")).toBe(false);
  });
});
