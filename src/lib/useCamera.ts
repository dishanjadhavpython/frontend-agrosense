"use client";

import { useEffect, useState } from "react";

/**
 * Does this device actually have a camera?
 *
 * The upload zones already offered a shutter button, gated on the `touch:`
 * variant — `@media (pointer: coarse)`. That is a proxy for "is this a phone",
 * and it is wrong in both directions: a touchscreen laptop with no webcam was
 * offered a camera that does not exist, and a desktop *with* a webcam was
 * refused one. The question the UI is actually asking is about hardware, so
 * ask the hardware.
 *
 * Three states, and `"unknown"` is the important one. `enumerateDevices` is
 * async and unavailable during server rendering, so a component that assumed
 * an answer on first paint would either hydrate differently from the server —
 * blanking the one control on the page — or flash the wrong button. Callers
 * show both options while unknown and remove the camera only once we know
 * there is none. Nothing ever appears late; something occasionally disappears,
 * which is the safer way round.
 *
 * Labels come back empty until camera permission is granted, and that is fine:
 * this only counts the devices, it never names them, so it needs no permission
 * prompt of its own. It does need `Permissions-Policy: camera=(self)`, which
 * `next.config.ts` sets.
 */
export type CameraState = "unknown" | "available" | "none";

export function useCamera(): CameraState {
  const [state, setState] = useState<CameraState>("unknown");

  useEffect(() => {
    let cancelled = false;

    // Older browsers, and any non-secure origin: `mediaDevices` is undefined.
    // Not knowing is a real answer, and it leaves both buttons on screen.
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    const look = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const hasCamera = devices.some((d) => d.kind === "videoinput");
        setState(hasCamera ? "available" : "none");
      } catch {
        // A permissions policy or a privacy extension can reject the call
        // outright. Stay at "unknown" — offering a camera that may not work is
        // a smaller failure than hiding one that does.
        if (!cancelled) setState("unknown");
      }
    };

    void look();

    // A USB webcam can be plugged in while the page is open, and on a phone
    // the list changes when permission is first granted.
    navigator.mediaDevices.addEventListener?.("devicechange", look);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.("devicechange", look);
    };
  }, []);

  return state;
}
