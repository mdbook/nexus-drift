import { useEffect, useState } from "react";

const LOW_FX_QUERY = "(hover: none) and (pointer: coarse) and (min-width: 1024px)";

function supportsMatchMedia() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function getInitialMatch() {
  return supportsMatchMedia() ? window.matchMedia(LOW_FX_QUERY).matches : false;
}

/**
 * Coarse-pointer desktop layouts (notably iPadOS landscape) hit Safari's
 * compositor much harder than laptop/desktop browsers. Use this hook for
 * presentation-only fallbacks that keep the same visual direction while
 * dropping the most expensive continuous animation work.
 */
export function useLowFxMode() {
  const [matches, setMatches] = useState(getInitialMatch);

  useEffect(() => {
    if (!supportsMatchMedia()) return;

    const media = window.matchMedia(LOW_FX_QUERY);
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
