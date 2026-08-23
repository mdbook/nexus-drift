import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

type Align = "center" | "start";

export type TooltipAnchor = { left: number; top: number; bottom: number };

/**
 * Only touch/pen taps should toggle a tooltip open — a mouse already gets the
 * hover path, and letting a mouse click latch the tooltip open would fight the
 * hover-leave close. Kept pure and exported so the toggle rule is unit-tested
 * without a DOM.
 */
export function isTapPointer(pointerType: string): boolean {
  return pointerType === "touch" || pointerType === "pen";
}

export function useTooltip(
  tooltipId: string,
  widthPx = 224,
  align: Align = "center"
): {
  open: boolean;
  triggerRef: RefObject<HTMLButtonElement>;
  triggerProps: {
    "aria-describedby": string | undefined;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
    onPointerDown: (event: { pointerType: string }) => void;
  };
  anchor: TooltipAnchor | null;
} {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Tap-latched open state for coarse pointers (touch/pen), which never fire the
  // hover events the tooltip otherwise relies on. Toggled on tap, dismissed by an
  // outside tap.
  const [tapped, setTapped] = useState(false);
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const open = hovered || focused || tapped;

  const onPointerDown = useCallback((event: { pointerType: string }) => {
    if (!isTapPointer(event.pointerType)) return;
    setTapped((prev) => !prev);
  }, []);

  // Close on any tap/click outside the trigger while latched open.
  useEffect(() => {
    if (!tapped) return;
    const onDocPointerDown = (event: PointerEvent) => {
      const node = triggerRef.current;
      if (node && event.target instanceof Node && node.contains(event.target)) return;
      setTapped(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [tapped]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setAnchor(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const margin = 8;
    let left: number;
    if (align === "start") {
      left = Math.min(rect.left, window.innerWidth - widthPx - margin);
      left = Math.max(left, margin);
    } else {
      const cx = rect.left + rect.width / 2;
      left = Math.min(Math.max(cx - widthPx / 2, margin), window.innerWidth - widthPx - margin);
    }
    setAnchor({ left, top: rect.top, bottom: rect.bottom });
  }, [open, widthPx, align]);

  return {
    open,
    triggerRef,
    triggerProps: {
      "aria-describedby": open ? tooltipId : undefined,
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      onPointerDown,
    },
    anchor,
  };
}
