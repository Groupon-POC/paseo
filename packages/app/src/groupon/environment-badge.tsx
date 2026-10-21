// Added for Groupon Desk (fork of Paseo, Apache-2.0): the environment badge in the sidebar, in place of the shell's floating one.

/**
 * The environment badge where it covers nothing: the sidebar's footer on a wide window, the
 * sidebar's header on a phone (`components/left-sidebar.tsx`). Drawn only by a build that offers a
 * choice of Core, while the chosen Core is not production (`environment-badge-model.ts`).
 * `useHideShellEnvironmentBadge` hides the web shell's floating badge for every build.
 *
 * Constraints:
 * - Never positioned over the page: it is a row of the sidebar, laid out like any other
 */

import { ExternalLink } from "lucide-react-native";
import { useCallback, useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { isWeb } from "@/constants/platform";
import { openExternalUrl } from "@/utils/open-external-url";
import { environmentBadge, hideShellEnvironmentBadge } from "./environment-badge-model";
import { environmentChoiceOffered } from "./environments";
import { useGrouponStore } from "./session";
import { GROUPON_ENVIRONMENT_BADGE } from "./strings";

const CHOICE_OFFERED = environmentChoiceOffered(
  __DEV__,
  process.env.EXPO_PUBLIC_GROUPON_ENVIRONMENTS,
);

/** Hides the web shell's floating badge (bottom-right, over the composer) once the window runs. */
export function useHideShellEnvironmentBadge(): void {
  useEffect(() => {
    if (isWeb && typeof document !== "undefined") hideShellEnvironmentBadge(document);
  }, []);
}

export function GrouponEnvironmentBadge({ placement }: { placement: "footer" | "header" }) {
  const environmentId = useGrouponStore((state) => state.environmentId);
  const badge = useMemo(
    () =>
      environmentBadge({
        choiceOffered: CHOICE_OFFERED,
        environmentId,
        pageHref: isWeb && typeof window !== "undefined" ? window.location.href : null,
      }),
    [environmentId],
  );
  const openProd = useCallback(() => {
    // The address at the moment of the press: the page may have moved since the render.
    const fresh = environmentBadge({
      choiceOffered: CHOICE_OFFERED,
      environmentId,
      pageHref: typeof window !== "undefined" ? window.location.href : null,
    });
    const url = fresh?.openProdUrl ?? badge?.openProdUrl ?? null;
    if (url) void openExternalUrl(url);
  }, [badge, environmentId]);
  if (!badge) return null;

  return (
    <View
      style={placement === "footer" ? styles.footerRow : styles.headerRow}
      testID="groupon-environment-badge"
    >
      <View style={styles.frame}>
        <Text style={styles.label} accessibilityHint={GROUPON_ENVIRONMENT_BADGE.hint(badge.label)}>
          {badge.label}
        </Text>
        {badge.openProdUrl ? (
          <Button
            variant="ghost"
            size="xs"
            onPress={openProd}
            leftIcon={OpenIcon}
            style={styles.open}
            textStyle={styles.openText}
            accessibilityRole="link"
            accessibilityLabel={GROUPON_ENVIRONMENT_BADGE.openProdLabel}
            testID="groupon-environment-badge-open-prod"
          >
            {GROUPON_ENVIRONMENT_BADGE.openProd}
          </Button>
        ) : null}
      </View>
    </View>
  );
}

/** The monorepo badge's red, so the two read as one sign. */
const RED = "#d92d20";

function OpenIcon() {
  return <ExternalLink size={12} color={RED} />;
}

const styles = StyleSheet.create((theme) => ({
  footerRow: {
    flexDirection: "row",
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[2],
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: theme.spacing[2],
  },
  frame: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: RED,
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
  },
  label: {
    color: RED,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 1,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
  },
  open: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderLeftWidth: 1,
    borderLeftColor: RED,
  },
  openText: {
    color: RED,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
}));
