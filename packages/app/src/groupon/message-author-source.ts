// Added for Groupon Desk (fork of Paseo, Apache-2.0): where the composer asks who is writing, without importing the sign-in.

/**
 * The composer (`composer/actions.ts`) names the author of every prompt it sends. It asks here, so
 * it does not import the Groupon session store (and its keychain) itself: the gate registers the
 * signed-in person as the source when it loads (`gate.tsx`). Until then, and in tests, a prompt
 * has no author, which every window draws as the workspace owner's.
 */

import type { UserMessageAuthor } from "@getpaseo/protocol/agent-types";

let source: () => UserMessageAuthor | undefined = () => undefined;

export function setMessageAuthorSource(next: () => UserMessageAuthor | undefined): void {
  source = next;
}

/** The person writing in this window now, on this device; undefined when nobody is signed in. */
export function currentMessageAuthor(): UserMessageAuthor | undefined {
  return source();
}
