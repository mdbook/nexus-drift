import { useLayoutEffect, useRef, useState, type RefObject } from "react";

type Align = "center" | "start";

export type TooltipAnchor = { left: number; top: number };

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
  };
  anchor: TooltipAnchor | null;
} {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const open = hovered || focused;

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
    setAnchor({ left, top: rect.top });
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
    },
    anchor,
  };
}
