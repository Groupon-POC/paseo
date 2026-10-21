// Added for Groupon Desk (fork of Paseo, Apache-2.0): "Open the sign-in page" as a real link on the web.

/**
 * The button that opens Groupon's sign-in page in the web build. In a browser it is an anchor
 * (`<a href target="_blank" rel="noopener noreferrer">`, react-native-web renders a View with
 * `href` as one): the person's tap follows it, which Safari allows, where a `window.open` from
 * script is blocked as a pop-up. Inside the Mac app the desktop host opens the address in the
 * default browser on the same tap.
 *
 * Constraints:
 * - Never open the page from script outside the person's tap.
 */

import { useCallback, useMemo, type ComponentType } from "react";
import { Text, View, type ViewProps } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { createControlGeometry } from "@/components/ui/control-geometry";
import { getDesktopHost } from "@/desktop/host";
import { openExternalUrl } from "@/utils/open-external-url";
import type { SignInPageButtonProps } from "./sign-in-page-button";

/** react-native-web's link props on View, which React Native's own types do not declare. */
interface WebLinkViewProps extends ViewProps {
  href: string;
  hrefAttrs: { target: string; rel: string };
}
const LinkView = View as unknown as ComponentType<WebLinkViewProps>;

export function SignInPageButton({ link, label, primary, testID }: SignInPageButtonProps) {
  const handlePress = useCallback(() => void openExternalUrl(link.href), [link.href]);
  const hrefAttrs = useMemo(
    () => ({ target: link.target, rel: link.rel }),
    [link.rel, link.target],
  );
  if (typeof getDesktopHost()?.opener?.openUrl === "function") {
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
  return (
    <LinkView
      href={link.href}
      hrefAttrs={hrefAttrs}
      accessibilityRole="link"
      style={[styles.link, primary ? styles.primary : styles.outline]}
      testID={testID}
    >
      <Text style={[styles.text, primary ? styles.textPrimary : null]}>{label}</Text>
    </LinkView>
  );
}

const FULL_WIDTH = { alignSelf: "stretch" } as const;

const styles = StyleSheet.create((theme) => {
  const geometry = createControlGeometry(theme);
  return {
    link: {
      ...geometry.buttonMd,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    primary: {
      alignSelf: "stretch",
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    outline: {
      alignSelf: "center",
      backgroundColor: "transparent",
      borderColor: theme.colors.borderAccent,
    },
    text: {
      ...geometry.buttonText,
      color: theme.colors.foreground,
      fontWeight: theme.fontWeight.normal,
    },
    textPrimary: {
      color: theme.colors.accentForeground,
    },
  };
});
