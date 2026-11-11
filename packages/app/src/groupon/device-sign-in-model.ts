// Added for Groupon Desk (fork of Paseo, Apache-2.0): the gate's device sign-in, without the screen.

/**
 * What the gate's sign-in card shows and does, kept apart from React so it can be tested.
 *
 * The desktop may open the sign-in page through its external browser bridge as soon as the code
 * arrives. Browsers and phones keep a tap-driven link because Safari blocks scripted pop-ups.
 * A poll Core could not serve (429, 5xx, unreachable) does not end the sign-in: the next poll
 * waits the back-off of `core-backoff.ts` on top of the interval, until the code expires.
 */

import { Backoff, retryableFailure } from "./core-backoff";
import { CoreError, type DeviceAuthPoll, type DeviceAuthStart } from "./core-client";
import { GROUPON_GATE } from "./strings";

/** The attributes of the link that opens the sign-in page in a new tab, on the person's tap. */
export interface SignInPageLink {
  href: string;
  target: "_blank";
  rel: "noopener noreferrer";
}

/** The sign-in page as a link, or null when Core sent something that is not an http(s) address. */
export function signInPageLink(verificationUri: string): SignInPageLink | null {
  let url: URL;
  try {
    url = new URL(verificationUri);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return { href: url.href, target: "_blank", rel: "noopener noreferrer" };
}

/**
 * Where to type the code by hand, host and path only (`sso.livingsocial.com/device`): the query
 * string carries the code, which the card already shows in large type.
 */
export function signInPageAddress(verificationUri: string): string | null {
  let url: URL;
  try {
    url = new URL(verificationUri);
  } catch {
    return null;
  }
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  return `${url.host}${path}`;
}

/** The line under the button: "or type the code at sso.livingsocial.com/device". */
export function typeCodeLine(verificationUri: string): string | null {
  const address = signInPageAddress(verificationUri);
  return address ? GROUPON_GATE.typeCodeAt(address) : null;
}

/**
 * Whether the card names the Core it signs in to. A release build signs in to production alone,
 * so the address says nothing to the person there; a build that offers a choice keeps it.
 */
export function coreLineShown(environmentChoice: boolean): boolean {
  return environmentChoice;
}

export interface DeviceSignInDeps {
  start: (coreUrl: string, name: string) => Promise<DeviceAuthStart>;
  poll: (coreUrl: string, deviceCode: string) => Promise<DeviceAuthPoll>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  isCancelled: () => boolean;
  /** The code is here: the screen shows it with the link to the sign-in page. */
  onStarted: (flow: DeviceAuthStart) => void;
  /** Desktop only: open the system browser, with the visible link kept as a fallback. */
  openSignInPage?: (link: SignInPageLink) => Promise<unknown>;
}

export const POLL_FLOOR_SECONDS = 2;

/**
 * Starts the device sign-in on `coreUrl` and polls until the person approves, denies or the code
 * expires. Resolves with the approved answer, or null when the screen went away first; throws a
 * `CoreError` on a denial or an expired code.
 */
export async function runDeviceSignIn(
  coreUrl: string,
  name: string,
  deps: DeviceSignInDeps,
): Promise<DeviceAuthPoll | null> {
  const started = await deps.start(coreUrl, name);
  if (deps.isCancelled()) return null;
  deps.onStarted(started);
  const link = signInPageLink(started.verificationUri);
  if (link && deps.openSignInPage) {
    try {
      await deps.openSignInPage(link);
    } catch {
      // The visible link lets the person retry opening the browser; keep polling for approval.
    }
  }
  const deadline = deps.now() + started.expiresIn * 1000;
  const intervalMs = Math.max(started.pollIntervalSeconds, POLL_FLOOR_SECONDS) * 1000;
  const backoff = new Backoff({ now: deps.now });
  let waitMs = intervalMs;
  while (!deps.isCancelled() && deps.now() < deadline) {
    await deps.sleep(waitMs);
    if (deps.isCancelled()) return null;
    let answer: DeviceAuthPoll;
    try {
      answer = await deps.poll(coreUrl, started.deviceCode);
    } catch (error) {
      const failure = retryableFailure(error);
      if (!failure) throw error;
      waitMs = Math.max(intervalMs, backoff.fail(failure.retryAfterMs));
      continue;
    }
    backoff.succeed();
    waitMs = intervalMs;
    if (answer.status === "approved") return answer;
    if (answer.status === "denied") throw new CoreError(GROUPON_GATE.denied, null);
    if (answer.status === "expired") break;
  }
  if (deps.isCancelled()) return null;
  throw new CoreError(GROUPON_GATE.expired, null);
}
