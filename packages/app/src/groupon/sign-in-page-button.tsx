// Added for Groupon Desk (fork of Paseo, Apache-2.0): "Open the sign-in page", on a phone or a Mac app.

/**
 * The button that opens Groupon's sign-in page, on iOS and Android: the person's tap hands the
 * address to the system (`Linking.openURL` through `openExternalUrl`). The web build has its own
 * file (`sign-in-page-button.web.tsx`), a real link a browser lets a tap open.
 */

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { openExternalUrl } from "@/utils/open-external-url";
import type { SignInPageLink } from "./device-sign-in-model";

export interface SignInPageButtonProps {
  link: SignInPageLink;
  label: string;
  /** Full width in the accent colour (the phone's card), else the outline button of the desktop. */
  primary: boolean;
  testID: string;
}

export function SignInPageButton({ link, label, primary, testID }: SignInPageButtonProps) {
  const handlePress = useCallback(() => void openExternalUrl(link.href), [link.href]);
  return (
    <Button
      variant={primary ? "default" : "outline"}
      onPress={handlePress}
      style={primary ? FULL_WIDTH : undefined}
      testID={testID}
    >
      {label}
    </Button>
  );
}

const FULL_WIDTH = { alignSelf: "stretch" } as const;
