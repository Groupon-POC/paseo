// Changed for Groupon Desk (fork of Paseo, Apache-2.0): no Expo push token is fetched or sent to a daemon.
import { revokeSubscription } from "./internal/subscriptions";
import type { RevokePushNotificationsInput, StartPushNotificationsInput } from "./internal/types";

/**
 * Groupon Desk registers no push token yet. Paseo's own path hands each daemon an Expo push token,
 * and the daemon's pushes then carry the last message's text through Expo's service. Groupon's
 * hand sends pushes without text, through Groupon's hub (design, section 6 item 8, and decision 1:
 * the platform never reads a transcript); until that hub path exists, the app asks for no
 * permission and fetches no token. `startSubscription` stays in the tree for a later rebase.
 */
export function startPushNotifications(_input: StartPushNotificationsInput): () => void {
  return () => undefined;
}

/** Still clears what an earlier Paseo build of this app may have registered. */
export function revokePushNotifications(input: RevokePushNotificationsInput): Promise<void> {
  return revokeSubscription(input).catch((error) => {
    console.warn("[PushNotifications] Failed to remove local push subscription", error);
  });
}
