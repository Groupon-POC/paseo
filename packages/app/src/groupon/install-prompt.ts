// Added for Groupon Desk (fork of Paseo, Apache-2.0): holds the browser's install offer until the person taps Install.

/**
 * Android Chrome fires `beforeinstallprompt` once, early, often before any screen has mounted. This
 * module listens from the moment it is imported (the gate imports it), keeps the event, and lets
 * the Install button spend it.
 *
 * Constraints:
 * - The event is prevented so Chrome's own mini-bar does not race the card; it is used once
 *   (`prompt()` can be called a single time), then dropped
 */

import { create } from "zustand";

/** The event Chrome fires; lib.dom does not declare it. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallPromptState {
  event: BeforeInstallPromptEvent | null;
  /** Shows the browser's install dialog; true when the person accepted. */
  install: () => Promise<boolean>;
}

export const useInstallPrompt = create<InstallPromptState>()((set, get) => ({
  event: null,
  install: async () => {
    const held = get().event;
    if (!held) return false;
    set({ event: null });
    await held.prompt();
    return (await held.userChoice).outcome === "accepted";
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    useInstallPrompt.setState({ event: event as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => useInstallPrompt.setState({ event: null }));
}
