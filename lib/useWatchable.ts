"use client";

import { useEffect, useRef, useState } from "react";

// "Watchable" = the ad surface is actually in front of the user: the tab/window
// is visible AND focused. Drives viewability — impressions only count while
// watchable. Works in the browser and the Tauri webview (same DOM APIs).

export function useWatchable() {
  const [watchable, setWatchable] = useState(true);
  const ref = useRef(true);

  useEffect(() => {
    const compute = () => {
      const v =
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        document.hasFocus();
      ref.current = v;
      setWatchable(v);
    };
    compute();
    window.addEventListener("focus", compute);
    window.addEventListener("blur", compute);
    document.addEventListener("visibilitychange", compute);
    return () => {
      window.removeEventListener("focus", compute);
      window.removeEventListener("blur", compute);
      document.removeEventListener("visibilitychange", compute);
    };
  }, []);

  return { watchable, ref };
}
