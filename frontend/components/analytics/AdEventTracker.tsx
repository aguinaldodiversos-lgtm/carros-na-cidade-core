"use client";

import { useEffect, useRef } from "react";
import { trackAdEvent } from "@/lib/analytics/public-events";

type AdEventTrackerProps = {
  adId: string;
  eventType: "view";
};

export default function AdEventTracker({ adId, eventType }: AdEventTrackerProps) {
  const trackedRef = useRef(false);

  useEffect(() => {
    if (trackedRef.current || !adId) return;
    trackedRef.current = true;
    trackAdEvent(adId, eventType);
  }, [adId, eventType]);

  return null;
}
