import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** Shared by the window chrome and the dock: both have to *stop computing*
 *  animations, not just skip a CSS transition, so the preference has to reach
 *  JS rather than living only in a media block. */
export default function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const list = window.matchMedia(QUERY);
    const onChange = (event) => setReduced(event.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
