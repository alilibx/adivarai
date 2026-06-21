"use client";

// Helpers for controlling the native Tauri window from the web surface.
// All no-op safely in a plain browser, so the same /surface page works both
// as a web page and inside the desktop app.

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function currentWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export async function showWindow() {
  if (!isTauri()) return;
  try {
    const w = await currentWindow();
    await w.show();
    await w.setFocus();
  } catch {
    /* not in a Tauri context */
  }
}

export async function hideWindow() {
  if (!isTauri()) return;
  try {
    const w = await currentWindow();
    await w.hide();
  } catch {
    /* not in a Tauri context */
  }
}
