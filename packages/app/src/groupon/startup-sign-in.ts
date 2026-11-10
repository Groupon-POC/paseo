/**
 * Recover the desktop's first sign-in read while the Mac's network and shared session start.
 * Stops at the first restored or manual sign-in, so signing out later stays signed out.
 * Each read that finds no sign-in waits longer (`core-backoff.ts`, never under 3 s): the Mac's main
 * process may renew the sign-in with Core on that read, so a Core that cannot serve it is not asked
 * every 3 s for as long as the window stays open.
 */
import { Backoff } from "./core-backoff";
import { retryStartupMacSession, useGrouponStore } from "./session";

const RETRY_MS = 3_000;

/** Called only after the desktop gate's initial hydration; cleanup stops future reads. */
export function recoverStartupMacSignIn(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const backoff = new Backoff();
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
  };
  const unsubscribe = useGrouponStore.subscribe((state) => {
    if (state.status !== "signedOut") stop();
  });
  const schedule = (delayMs: number) => {
    if (stopped) return;
    if (useGrouponStore.getState().status !== "signedOut") {
      stop();
      return;
    }
    timer = setTimeout(() => {
      void retryStartupMacSession(() => stopped)
        .catch(() => {
          // A startup read is best-effort; leave the sign-in available and try again later.
        })
        .finally(() => schedule(Math.max(RETRY_MS, backoff.fail())));
    }, delayMs);
  };
  schedule(RETRY_MS);
  return stop;
}
