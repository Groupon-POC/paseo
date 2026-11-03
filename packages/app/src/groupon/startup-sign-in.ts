/**
 * Recover the desktop's first sign-in read while the Mac's network and shared session start.
 * Stops at the first restored or manual sign-in, so signing out later stays signed out.
 */
import { retryStartupMacSession, useGrouponStore } from "./session";

const RETRY_MS = 3_000;

/** Called only after the desktop gate's initial hydration; cleanup stops future reads. */
export function recoverStartupMacSignIn(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
  };
  const unsubscribe = useGrouponStore.subscribe((state) => {
    if (state.status !== "signedOut") stop();
  });
  const schedule = () => {
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
        .finally(schedule);
    }, RETRY_MS);
  };
  schedule();
  return stop;
}
