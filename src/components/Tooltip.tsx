import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import type { TooltipAnchor } from "@/hooks/useTooltip";

/**
 * Renders a tooltip panel via a portal to document.body with `position: fixed`
 * so it escapes every clipping ancestor (overflow-x-auto rows, sticky
 * containers, etc.). By default it positions above the anchor point with a
 * downward arrow, but top-chrome UI can opt into a below placement.
 *
 * Use `useTooltip` to get the `open` flag and `anchor` position from a trigger
 * element, then pass them here.
 */
export function TooltipPanel({
  id,
  open,
  anchor,
  width = 224,
  borderClass = "border-white/15",
  arrowAlign = "center",
  placement = "above",
  children,
}: {
  id: string;
  open: boolean;
  anchor: TooltipAnchor | null;
  width?: number;
  borderClass?: string;
  arrowAlign?: "center" | "left";
  placement?: "above" | "below";
  children: ReactNode;
}) {
  if (!open || !anchor) return null;
  return createPortal(
    <div
      id={id}
      role="tooltip"
      style={{
        position: "fixed",
        left: anchor.left,
        top: placement === "below" ? anchor.bottom : anchor.top,
        width,
        transform: placement === "below" ? "translateY(8px)" : "translateY(calc(-100% - 8px))",
      }}
      className={cn(
        "pointer-events-none z-50 max-w-[calc(100vw-2rem)] rounded-2xl border bg-slate-950/95 p-2.5 text-left shadow-hud backdrop-blur-xl",
        borderClass
      )}
    >
      {children}
      <span
        aria-hidden
        className={cn(
          "absolute h-2 w-2 rotate-45 bg-slate-950/95",
          borderClass,
          placement === "below"
            ? "bottom-full translate-y-1 border-l border-t"
            : "top-full -translate-y-1 border-b border-r",
          arrowAlign === "left" ? "left-4" : "left-1/2 -translate-x-1/2"
        )}
      />
    </div>,
    document.body
  );
}
