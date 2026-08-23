import { useEffect, useState } from "react";

// Any touch/pen primary pointer, at any viewport width (unlike useLowFxMode,
// which additionally requires lg width for its desktop-FX budget). This is the
// signal for touch-target sizing — an iPad in portrait or a phone needs the
// larger field hit-halos just as much as landscape does.
const COARSE_POINTER_QUERY = "(hover: none) and (pointer: coarse)";

function supportsMatchMedia() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function getInitialMatch() {
  return supportsMatchMedia() ? window.matchMedia(COARSE_POINTER_QUERY).matches : false;
}

/**
 * True when the primary pointer is coarse (touch/pen) and cannot hover — the
 * cue to enlarge invisible field hit-targets to the ~44px touch minimum and to
 * enable tap-toggle affordances. Presentation/input only; never branch game
 * logic on it.
 */
export function useCoarsePointer() {
  const [matches, setMatches] = useState(getInitialMatch);

  useEffect(() => {
    if (!supportsMatchMedia()) return;

    const media = window.matchMedia(COARSE_POINTER_QUERY);
    const onChange = () => setMatches(media.matches);
    onChange();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }

    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  return matches;
}
