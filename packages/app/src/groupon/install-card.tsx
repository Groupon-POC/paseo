// Added for Groupon Desk (fork of Paseo, Apache-2.0): the "Add to your home screen" card, under the gate and in Settings > Groupon.

/**
 * The card that tells a phone's browser the web build is an app. iOS Safari: the three steps with
 * the Share icon. Android Chrome: an Install button bound to the browser's own offer
 * (`install-prompt.ts`). Which one, if any, is `install-card-model.ts`'s call; this file only draws.
 *
 * Constraints:
 * - The gate's card carries "Not now", remembered on this device; Settings' section has none, so
 *   the steps stay reachable there after a dismissal
 */

import { Download, Share } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Button } from "@/components/ui/button";
import { getIsElectron, isWeb } from "@/constants/platform";
import type { Theme } from "@/styles/theme";
import { installCard, readBrowser, type InstallCardKind } from "./install-card-model";
import { useInstallPrompt } from "./install-prompt";
import { useGrouponPreferences } from "./preferences";
import { GROUPON_INSTALL } from "./strings";

const ThemedShare = withUnistyles(Share);
const foregroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });

/** The card this browser should show now, or null; `ignoreDismissed` for Settings. */
export function useInstallCardKind(ignoreDismissed: boolean): InstallCardKind | null {
  const dismissed = useGrouponPreferences((state) => state.installCardDismissed === true);
  const promptAvailable = useInstallPrompt((state) => state.event !== null);
  const browser = readBrowser(typeof window === "undefined" ? undefined : window, {
    isWeb,
    isElectron: getIsElectron(),
    promptAvailable,
  });
  return installCard(browser, ignoreDismissed ? false : dismissed);
}

/** The card under the gate's sign-in and vault steps: dismissable. */
export function GateInstallCard() {
  const kind = useInstallCardKind(false);
  const dismiss = useGrouponPreferences((state) => state.dismissInstallCard);
  // Until this device's preferences are read, a dismissed card would flash on.
  const [hydrated, setHydrated] = useState(() => useGrouponPreferences.persist.hasHydrated());
  useEffect(() => {
    setHydrated(useGrouponPreferences.persist.hasHydrated());
    return useGrouponPreferences.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  if (!kind || !hydrated) return null;
  return <InstallCard kind={kind} onDismiss={dismiss} />;
}

/** Settings > Groupon's section: the same card, never dismissable. */
export function InstallSection() {
  const kind = useInstallCardKind(true);
  if (!kind) return null;
  return (
    <SettingsSection title={GROUPON_INSTALL.section}>
      <InstallCard kind={kind} />
    </SettingsSection>
  );
}

function InstallCard({ kind, onDismiss }: { kind: InstallCardKind; onDismiss?: () => void }) {
  return (
    <View style={styles.card} testID="groupon-install-card">
      {kind === "ios" ? <IosSteps /> : <AndroidInstall />}
      <Text style={styles.hint}>{GROUPON_INSTALL.keepsSignedIn}</Text>
      {onDismiss ? (
        <Button variant="ghost" size="sm" onPress={onDismiss} testID="groupon-install-dismiss">
          {GROUPON_INSTALL.notNow}
        </Button>
      ) : null}
    </View>
  );
}

function IosSteps() {
  return (
    <>
      <Text style={styles.title}>{GROUPON_INSTALL.iosTitle}</Text>
      <Text style={styles.hint}>{GROUPON_INSTALL.iosIntro}</Text>
      {GROUPON_INSTALL.iosSteps.map((step, index) => (
        <View key={step} style={styles.step} testID={`groupon-install-step-${index + 1}`}>
          <Text style={styles.number}>{index + 1}</Text>
          <Text style={styles.stepText}>{step}</Text>
          {index === 0 ? <ThemedShare size={18} uniProps={foregroundMapping} /> : null}
        </View>
      ))}
    </>
  );
}

function AndroidInstall() {
  const install = useInstallPrompt((state) => state.install);
  const handleInstall = useCallback(() => void install(), [install]);
  return (
    <>
      <Text style={styles.title}>{GROUPON_INSTALL.installTitle}</Text>
      <Text style={styles.hint}>{GROUPON_INSTALL.installIntro}</Text>
      <Button
        variant="default"
        leftIcon={Download}
        onPress={handleInstall}
        testID="groupon-install"
      >
        {GROUPON_INSTALL.install}
      </Button>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    width: "100%",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  number: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    width: 16,
  },
  stepText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
}));
