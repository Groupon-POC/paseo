// Added for Groupon Desk (fork of Paseo, Apache-2.0): where Groupon's SSO gateway sends the web build back.

/**
 * The gateway's return address, `/sso/callback`. The gate exchanges the code before the app
 * mounts (`groupon/session.ts`, `finishSsoRedirect`); by the time the router shows this route the
 * person is signed in, so it only moves on to the page they pressed Sign in on.
 */

import { Redirect, type Href } from "expo-router";
import { useState } from "react";
import { takeSsoReturnPath } from "@/groupon/sso-redirect";

export default function SsoCallbackRoute() {
  // A same-origin path `safeReturnPath` checked; typed routes cannot know it statically.
  const [target] = useState(() => takeSsoReturnPath() as Href);
  return <Redirect href={target} />;
}
