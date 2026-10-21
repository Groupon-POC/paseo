// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Groupon sign-in in front of everything else.

/**
 * The first screens of Groupon Desk, before any Mac is paired: the Core to sign in to, the device
 * sign-in Groupon's CLI uses (a code approved on Groupon's SSO page), then the vault passphrase,
 * typed once and turned into the vault key on this device. Only when both are done does Paseo's
 * app start behind it.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, View } from "react-native";
import { isWeb } from "@/constants/platform";
import { StyleSheet } from "react-native-unistyles";
import { ThemedGrouponMark } from "./groupon-mark";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EditingTextInput } from "@/components/ui/text-input";
import { openExternalUrl } from "@/utils/open-external-url";
import { CoreError, deviceAuthPoll, deviceAuthStart, type DeviceAuthStart } from "./core-client";
import {
  environmentChoiceOffered,
  GROUPON_ENVIRONMENTS,
  normaliseCoreUrl,
  type GrouponEnvironmentId,
} from "./environments";
import { GrouponHubSync } from "./hub-sync";
import { signedInMessageAuthor } from "./message-author";
import { setMessageAuthorSource } from "./message-author-source";
import { useGrouponStore } from "./session";
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
const POLL_FLOOR_SECONDS = 2;

// Every prompt the composer sends names the signed-in person (`message-author-source.ts`).
setMessageAuthorSource(signedInMessageAuthor);

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function GrouponGate({ children }: { children: ReactNode }) {
  const status = useGrouponStore((state) => state.status);
  const hydrate = useGrouponStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
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
      </View>
    </ScrollView>
  );
}

function SignInStep() {
  const environmentId = useGrouponStore((state) => state.environmentId);
  const coreUrl = useGrouponStore((state) => state.coreUrl);
  const chooseEnvironment = useGrouponStore((state) => state.chooseEnvironment);
  const acceptApprovedPoll = useGrouponStore((state) => state.acceptApprovedPoll);
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

  const handleSignIn = useCallback(async () => {
    setError(null);
    let target = coreUrl;
    if (environmentId === "local") {
      const typed = normaliseCoreUrl(localUrl);
      if (!typed) {
        setError(GROUPON_GATE.badLocalUrl);
        return;
      }
      target = typed;
      await chooseEnvironment("local", typed);
    }
    setBusy(true);
    try {
      const started = await deviceAuthStart(target, `Groupon Desk app (${Platform.OS})`);
      setFlow(started);
      void openExternalUrl(started.verificationUri);
      const deadline = Date.now() + started.expiresIn * 1000;
      const intervalMs = Math.max(started.pollIntervalSeconds, POLL_FLOOR_SECONDS) * 1000;
      while (!cancelled.current && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        const answer = await deviceAuthPoll(target, started.deviceCode);
        if (answer.status === "approved") {
          await acceptApprovedPoll(answer);
          return;
        }
        if (answer.status === "denied") throw new CoreError(GROUPON_GATE.denied, null);
        if (answer.status === "expired") break;
      }
      if (!cancelled.current) throw new CoreError(GROUPON_GATE.expired, null);
    } catch (caught) {
      if (!cancelled.current) setError(messageOf(caught));
    } finally {
      if (!cancelled.current) {
        setBusy(false);
        setFlow(null);
      }
    }
  }, [acceptApprovedPoll, chooseEnvironment, coreUrl, environmentId, localUrl]);
  const handleSignInPress = useCallback(() => void handleSignIn(), [handleSignIn]);
  const handleOpenPage = useCallback(() => {
    if (flow) void openExternalUrl(flow.verificationUri);
  }, [flow]);

  return (
    <View style={styles.card}>
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
      ) : (
        <Text style={styles.hint}>{coreUrl}</Text>
      )}
      {flow ? (
        <View style={styles.codeBox} testID="groupon-device-code">
          <Text style={styles.hint}>{GROUPON_GATE.codeIntro}</Text>
          <Text style={styles.code} selectable>
            {flow.userCode}
          </Text>
          <Button variant="outline" onPress={handleOpenPage}>
            {GROUPON_GATE.openPage}
          </Button>
          <Text style={styles.hint} selectable>
            {flow.verificationUri}
          </Text>
        </View>
      ) : null}
      <Button variant="default" onPress={handleSignInPress} loading={busy} testID="groupon-sign-in">
        {busy ? GROUPON_GATE.waiting : GROUPON_GATE.signIn}
      </Button>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function VaultStep() {
  const identity = useGrouponStore((state) => state.identity);
  const unlockVault = useGrouponStore((state) => state.unlockVault);
  const signOut = useGrouponStore((state) => state.signOut);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <View style={styles.card}>
      <Text style={styles.body}>
        {GROUPON_GATE.signedInAs} {identity?.email ?? identity?.name ?? "?"}
      </Text>
      <Text style={styles.hint}>
        {isWeb ? GROUPON_GATE.vaultIntroWeb : GROUPON_GATE.vaultIntro}
      </Text>
      <EditingTextInput
        initialValue=""
        onChangeText={setPassphrase}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={GROUPON_GATE.passphrasePlaceholder}
        onSubmitEditing={handleUnlockPress}
        style={styles.input}
        testID="groupon-vault-passphrase"
      />
      <Button
        variant="default"
        onPress={handleUnlockPress}
        loading={busy}
        disabled={passphrase.length === 0}
        testID="groupon-vault-open"
      >
        {busy ? GROUPON_GATE.deriving : GROUPON_GATE.openVault}
      </Button>
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
    padding: theme.spacing[6],
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
  code: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize["4xl"],
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 4,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));
