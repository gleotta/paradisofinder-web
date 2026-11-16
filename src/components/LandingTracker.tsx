"use client";

import { useEffect, useRef } from "react";
import { EVENTS, trackEvent } from "@/lib/track";

/** Vista de una página SEO (T6/T7): una vez por carga. */
export default function LandingTracker({ slug, total, shown }: { slug: string; total: number; shown: number }) {
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (fired.current === slug) return;
    fired.current = slug;
    trackEvent(EVENTS.LANDING_VIEWED, { slug, total, shown });
  }, [slug, total, shown]);
  return null;
}
