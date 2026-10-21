// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Groupon sign-in in front of everything else.

/**
 * The first screens of Groupon Desk, before any Mac is paired: the Core to sign in to, the sign-in,
 * then the vault passphrase, typed once and turned into the vault key on this device. Only when
 * both are done does Paseo's app start behind it.
 *
 * The sign-in: in a browser on the window's own hosts, the tab goes to Groupon's SSO gateway and
 * comes back signed in (`sso-redirect.ts`), as every Groupon frontend does; anywhere else (the
 * Electron window, which also takes this Mac's sign-in; a phone app; a host the gateway would
 * refuse) and on the person's choice, the device sign-in Groupon's CLI uses (a code approved on
 * Groupon's SSO page).
 *
 * Constraints:
 * - Launched from the home screen (standalone), sign-in is the device code, never the redirect
 * - Never open the device code's sign-in page from script: only the person's tap on the card's
 *   link opens it (Safari blocks a page opened after the code arrives as a pop-up). The redirect
 *   moves this same tab, which no browser blocks.
 * - A release build names no Core address (production only); a build with a choice does.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as Clipboard from "expo-clipboard";
import { ActivityIndicator, Platform, ScrollView, Text, View } from "react-native";
import { useIsCompactFormFactor } from "@/constants/layout";
import { getIsElectron, isWeb } from "@/constants/platform";
import { StyleSheet } from "react-native-unistyles";
import { ThemedGrouponMark } from "./groupon-mark";
import { Button } from "@/components/ui/button";
import { PressHighlight } from "@/components/ui/press-highlight";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EditingTextInput } from "@/components/ui/text-input";
import { deviceAuthPoll, deviceAuthStart, type DeviceAuthStart } from "./core-client";
import {
  coreLineShown,
  runDeviceSignIn,
  signInPageLink,
  typeCodeLine,
} from "./device-sign-in-model";
import {
  environmentChoiceOffered,
  GROUPON_ENVIRONMENTS,
  normaliseCoreUrl,
  type GrouponEnvironmentId,
} from "./environments";
import { useHideShellEnvironmentBadge } from "./environment-badge";
import { GrouponHubSync } from "./hub-sync";
import { GateInstallCard } from "./install-card";
import { launchedStandalone } from "./install-card-model";
import { signedInMessageAuthor } from "./message-author";
import { setMessageAuthorSource } from "./message-author-source";
import { finishSsoRedirect, useGrouponStore } from "./session";
import { SecretInput } from "./secret-input";
import { SignInPageButton } from "./sign-in-page-button";
import { buildSsoLoginUrl, redirectSignInOffered, ssoGatewayUrlFor } from "./sso-redirect";
import { GROUPON_GATE } from "./strings";

const ENVIRONMENT_OPTIONS = GROUPON_ENVIRONMENTS.map((env) => ({
  value: env.id,
  label: env.label,
}));
/** A release build offers no choice: production only (`environmentChoiceOffered`). */
const ENVIRONMENT_CHOICE = environmentChoiceOffered(
  __DEV__,
  process.env.EXPO_PUBLIC_GROUPON_ENVIRONMENTS,
);

/** A release build names no Core address: it signs in to production alone. */
const SHOW_CORE_LINE = coreLineShown(ENVIRONMENT_CHOICE);

// Every prompt the composer sends names the signed-in person (`message-author-source.ts`).
setMessageAuthorSource(signedInMessageAuthor);

/** The browser page's origin, or null in the Electron window and a phone app (no redirect there). */
function browserPageOrigin(): string | null {
  if (!isWeb || getIsElectron() || typeof window === "undefined" || !window.location) return null;
  return window.location.origin;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function GrouponGate({ children }: { children: ReactNode }) {
  const status = useGrouponStore((state) => state.status);
  const hydrate = useGrouponStore((state) => state.hydrate);
  useHideShellEnvironmentBadge();

  useEffect(() => {
    // The gateway's return is exchanged first, so hydrate finds the session it kept.
    void finishSsoRedirect()
      .catch((caught: unknown) => useGrouponStore.setState({ signInError: messageOf(caught) }))
      .finally(() => void hydrate());
  }, [hydrate]);

  if (status === "ready") {
    return (
      <>
        {children}
        <GrouponHubSync />
      </>
    );
  }
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.column}>
        <ThemedGrouponMark size={120} />
        <Text style={styles.title}>{GROUPON_GATE.title}</Text>
        {status === "loading" ? <ActivityIndicator /> : null}
        {status === "signedOut" ? <SignInStep /> : null}
        {status === "vault" ? <VaultStep /> : null}
        {status !== "loading" ? <GateInstallCard /> : null}
      </View>
    </ScrollView>
  );
}

function SignInStep() {
  const environmentId = useGrouponStore((state) => state.environmentId);
  const coreUrl = useGrouponStore((state) => state.coreUrl);
  const chooseEnvironment = useGrouponStore((state) => state.chooseEnvironment);
  const acceptApprovedPoll = useGrouponStore((state) => state.acceptApprovedPoll);
  const redirectError = useGrouponStore((state) => state.signInError);
  const compact = useIsCompactFormFactor();
  const pageOrigin = browserPageOrigin();
  const [codeChosen, setCodeChosen] = useState(false);
  // Launched from the home screen the page is an app window: a redirect to the gateway and back
  // can land in the browser's own storage, not the app's, so the device code is the way in there.
  const redirect =
    !codeChosen &&
    !launchedStandalone(typeof window === "undefined" ? undefined : window) &&
    redirectSignInOffered(pageOrigin, environmentId);
  const [localUrl, setLocalUrl] = useState(
    environmentId === "local" ? coreUrl : "http://localhost:4000",
  );
  const [flow, setFlow] = useState<DeviceAuthStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false);

  // A build with no choice signs in to production, whatever an older build stored.
  useEffect(() => {
    if (!ENVIRONMENT_CHOICE && environmentId !== "production") void chooseEnvironment("production");
  }, [chooseEnvironment, environmentId]);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const handleEnvironment = useCallback(
    (id: GrouponEnvironmentId) => {
      setError(null);
      void chooseEnvironment(
        id,
        id === "local" ? (normaliseCoreUrl(localUrl) ?? undefined) : undefined,
      );
    },
    [chooseEnvironment, localUrl],
  );

  /** The Core to sign in to, a typed local one kept first; null (with the reason shown) when unusable. */
  const signInTarget = useCallback(async (): Promise<string | null> => {
    if (environmentId !== "local") return coreUrl;
    const typed = normaliseCoreUrl(localUrl);
    if (!typed) {
      setError(GROUPON_GATE.badLocalUrl);
      return null;
    }
    await chooseEnvironment("local", typed);
    return typed;
  }, [chooseEnvironment, coreUrl, environmentId, localUrl]);

  // This tab goes to Groupon's SSO gateway and comes back to /sso/callback (`sso-redirect.ts`).
  const handleRedirect = useCallback(async () => {
    setError(null);
    const target = await signInTarget();
    if (!target || !pageOrigin) return;
    setBusy(true);
    try {
      const url = await buildSsoLoginUrl(
        {
          gatewayUrl: ssoGatewayUrlFor(environmentId, target),
          coreUrl: target,
          pageOrigin,
          returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        },
        { storage: window.sessionStorage },
      );
      window.location.assign(url);
    } catch (caught) {
      setError(messageOf(caught));
      setBusy(false);
    }
  }, [environmentId, pageOrigin, signInTarget]);
  const handleRedirectPress = useCallback(() => void handleRedirect(), [handleRedirect]);

  // Back from the gateway without signing in: a page restored from the browser's cache would
  // still show the button busy.
  useEffect(() => {
    if (!pageOrigin) return;
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, [pageOrigin]);

  // The sign-in page is not opened from here: only the person's tap on the card's link opens it
  // (`device-sign-in-model.ts`; a page opened by script is a pop-up Safari blocks).
  const handleSignIn = useCallback(async () => {
    setError(null);
    const target = await signInTarget();
    if (!target) return;
    setBusy(true);
    try {
      const approved = await runDeviceSignIn(target, `Groupon Desk app (${Platform.OS})`, {
        start: deviceAuthStart,
        poll: deviceAuthPoll,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        now: Date.now,
        isCancelled: () => cancelled.current,
        onStarted: setFlow,
      });
      if (approved) await acceptApprovedPoll(approved);
    } catch (caught) {
      if (!cancelled.current) setError(messageOf(caught));
    } finally {
      if (!cancelled.current) {
        setBusy(false);
        setFlow(null);
      }
    }
  }, [acceptApprovedPoll, signInTarget]);
  const handleSignInPress = useCallback(() => void handleSignIn(), [handleSignIn]);
  const handleCodeInstead = useCallback(() => {
    setCodeChosen(true);
    void handleSignIn();
  }, [handleSignIn]);
  const shownError = error ?? redirectError;

  return (
    <View style={[styles.card, compact ? styles.cardCompact : null]}>
      <Text style={styles.body}>
        {ENVIRONMENT_CHOICE ? GROUPON_GATE.signInIntroChoice : GROUPON_GATE.signInIntro}
      </Text>
      {ENVIRONMENT_CHOICE ? (
        <SegmentedControl
          options={ENVIRONMENT_OPTIONS}
          value={environmentId}
          onValueChange={handleEnvironment}
          testID="groupon-environment"
        />
      ) : null}
      {ENVIRONMENT_CHOICE && environmentId === "local" ? (
        <EditingTextInput
          initialValue={localUrl}
          onChangeText={setLocalUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://localhost:4000"
          style={styles.input}
          testID="groupon-local-core-url"
        />
      ) : null}
      {SHOW_CORE_LINE && environmentId !== "local" ? (
        <Text style={styles.hint}>{coreUrl}</Text>
      ) : null}
      {redirect ? (
        <RedirectSignIn
          busy={busy}
          onSignIn={handleRedirectPress}
          onCodeInstead={handleCodeInstead}
        />
      ) : (
        <DeviceSignIn flow={flow} compact={compact} busy={busy} onSignIn={handleSignInPress} />
      )}
      {shownError ? <Text style={styles.error}>{shownError}</Text> : null}
    </View>
  );
}

/**
 * The web build's sign-in on its own hosts: the button moves this tab to Groupon's SSO gateway and
 * back (`sso-redirect.ts`); the line under it says so, and the link below reaches the device code
 * for when Groupon's page refuses this address.
 */
function RedirectSignIn({
  busy,
  onSignIn,
  onCodeInstead,
}: {
  busy: boolean;
  onSignIn: () => void;
  onCodeInstead: () => void;
}) {
  return (
    <>
      <Button variant="default" onPress={onSignIn} loading={busy} testID="groupon-sign-in">
        {GROUPON_GATE.signIn}
      </Button>
      <Text style={[styles.hint, styles.centered]}>{GROUPON_GATE.redirectLine}</Text>
      <Text
        style={[styles.hint, styles.centered, styles.link]}
        onPress={onCodeInstead}
        accessibilityRole="button"
        testID="groupon-sign-in-code-instead"
      >
        {GROUPON_GATE.codeInstead}
      </Text>
    </>
  );
}

/**
 * The device sign-in's controls: the code once it is here, and the button, which on a phone gives
 * way to a spinner while the code waits for approval.
 */
function DeviceSignIn({
  flow,
  compact,
  busy,
  onSignIn,
}: {
  flow: DeviceAuthStart | null;
  compact: boolean;
  busy: boolean;
  onSignIn: () => void;
}) {
  return (
    <>
      {flow ? <DeviceCode flow={flow} compact={compact} /> : null}
      {flow && compact ? (
        <View style={styles.waiting} testID="groupon-sign-in-waiting">
          <ActivityIndicator size="small" />
          <Text style={styles.hint}>{GROUPON_GATE.waiting}</Text>
        </View>
      ) : (
        <Button variant="default" onPress={onSignIn} loading={busy} testID="groupon-sign-in">
          {busy ? GROUPON_GATE.waiting : GROUPON_GATE.signIn}
        </Button>
      )}
    </>
  );
}

const CODE_COPIED_FOR_MS = 2000;

/**
 * The code to approve, which a tap copies, the link to the sign-in page, and where to type the
 * code by hand. On a phone it sits flat in the card, the code large and monospaced, the link a
 * full-width button; the desktop keeps the inner box.
 */
function DeviceCode({ flow, compact }: { flow: DeviceAuthStart; compact: boolean }) {
  const link = signInPageLink(flow.verificationUri);
  const typeLine = typeCodeLine(flow.verificationUri);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = useCallback(async () => {
    await Clipboard.setStringAsync(flow.userCode);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), CODE_COPIED_FOR_MS);
  }, [flow.userCode]);
  const handleCopy = useCallback(() => void copy(), [copy]);

  return (
    <View style={compact ? styles.codeFlat : styles.codeBox} testID="groupon-device-code">
      <Text style={[styles.hint, styles.centered]}>{GROUPON_GATE.codeIntro}</Text>
      <PressHighlight
        onPress={handleCopy}
        accessibilityRole="button"
        accessibilityLabel={GROUPON_GATE.copyCode}
        testID="groupon-device-code-copy"
      >
        <Text style={compact ? styles.codeCompact : styles.code} selectable>
          {flow.userCode}
        </Text>
      </PressHighlight>
      <Text style={[styles.hint, styles.centered]}>
        {copied ? GROUPON_GATE.codeCopied : GROUPON_GATE.copyCode}
      </Text>
      {link ? (
        <SignInPageButton
          link={link}
          label={GROUPON_GATE.openPage}
          primary={compact}
          testID="groupon-open-sign-in-page"
        />
      ) : null}
      {typeLine ? <Text style={[styles.hint, styles.centered]}>{typeLine}</Text> : null}
    </View>
  );
}

function VaultStep() {
  const identity = useGrouponStore((state) => state.identity);
  const unlockVault = useGrouponStore((state) => state.unlockVault);
  const signOut = useGrouponStore((state) => state.signOut);
  const compact = useIsCompactFormFactor();
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  const handleUnlock = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await unlockVault(passphrase);
    } catch (caught) {
      setError(messageOf(caught));
      setBusy(false);
    }
  }, [passphrase, unlockVault]);
  const handleUnlockPress = useCallback(() => void handleUnlock(), [handleUnlock]);
  const handleSignOut = useCallback(() => void signOut(), [signOut]);
  const handleWhy = useCallback(() => setWhyOpen(true), []);
  const fullIntro = isWeb ? GROUPON_GATE.vaultIntroWeb : GROUPON_GATE.vaultIntro;

  return (
    <View style={[styles.card, compact ? styles.cardCompact : null]}>
      <Text style={styles.body}>
        {GROUPON_GATE.signedInAs} {identity?.email ?? identity?.name ?? "?"}
      </Text>
      {compact && !whyOpen ? (
        <Text style={styles.hint}>
          {GROUPON_GATE.vaultIntroShort}{" "}
          <Text
            style={styles.link}
            onPress={handleWhy}
            accessibilityRole="button"
            testID="groupon-vault-why"
          >
            {GROUPON_GATE.why}
          </Text>
        </Text>
      ) : (
        <Text style={styles.hint}>{fullIntro}</Text>
      )}
      <SecretInput
        onChangeText={setPassphrase}
        placeholder={GROUPON_GATE.passphrasePlaceholder}
        onSubmitEditing={handleUnlockPress}
        testID="groupon-vault-passphrase"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        variant="default"
        onPress={handleUnlockPress}
        loading={busy}
        disabled={passphrase.length === 0}
        testID="groupon-vault-open"
      >
        {busy ? GROUPON_GATE.deriving : GROUPON_GATE.openVault}
      </Button>
      <Button variant="ghost" size="sm" onPress={handleSignOut}>
        {GROUPON_GATE.signOut}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: { xs: theme.spacing[4], md: theme.spacing[6] },
  },
  column: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    alignItems: "center",
    gap: theme.spacing[4],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize["3xl"],
    fontWeight: theme.fontWeight.semibold,
  },
  card: {
    width: "100%",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardCompact: {
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },
  body: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  input: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  codeBox: {
    gap: theme.spacing[2],
    alignItems: "center",
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
  },
  codeFlat: {
    gap: theme.spacing[3],
    alignItems: "stretch",
  },
  code: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize["4xl"],
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 4,
  },
  codeCompact: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: 34,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 3,
    textAlign: "center",
  },
  centered: {
    textAlign: "center",
  },
  waiting: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
  },
  link: {
    color: theme.colors.foreground,
    textDecorationLine: "underline",
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));
