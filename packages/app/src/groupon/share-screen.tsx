// Added for Groupon Desk (fork of Paseo, Apache-2.0): Share, who may read or write one of your workspaces; the legend of the chat's three looks.
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { BackHeader } from "@/components/headers/back-header";
import { Button } from "@/components/ui/button";
import { EditingTextInput } from "@/components/ui/text-input";
import {
  fetchOverview,
  revokeShare,
  shareWorkspace,
  type HubOverview,
  type HubShareRole,
} from "./hub";
import { AuthorLegend } from "./message-author";
import { presenceLines } from "./presence-model";
import { useHubPresence } from "./presence-row";
import { hubWorkspaceForPath, normaliseEmail, sharesOfWorkspace } from "./share-model";
import { GROUPON_PRESENCE, GROUPON_SHARE } from "./strings";

function errorText(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}

/** The workspace by its hub id, or by its folder when opened from the sidebar. */
function resolveWorkspace(overview: HubOverview, workspaceId?: string, path?: string) {
  if (workspaceId)
    return overview.workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
  return path ? hubWorkspaceForPath(overview, path) : null;
}

export function HubShareScreen({ workspaceId, path }: { workspaceId?: string; path?: string }) {
  const [overview, setOverview] = useState<HubOverview | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<HubShareRole>("read");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOverview(await fetchOverview());
    } catch (caught) {
      setError(errorText(caught));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const workspace = overview ? resolveWorkspace(overview, workspaceId, path) : null;
  const grants = overview && workspace ? sharesOfWorkspace(overview, workspace.id) : [];

  const handleShare = useCallback(async () => {
    if (!workspace) return;
    const typed = normaliseEmail(email);
    if (!typed) {
      setError(GROUPON_SHARE.badEmail);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { share } = await shareWorkspace(workspace.id, typed, role);
      setNotice(GROUPON_SHARE.shared(share.grantee.email, share.role));
      await load();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }, [email, load, role, workspace]);

  const handleRevoke = useCallback(
    async (shareId: string, grantee: string) => {
      setBusy(true);
      setError(null);
      try {
        await revokeShare(shareId);
        setNotice(GROUPON_SHARE.revoked(grantee));
        await load();
      } catch (caught) {
        setError(errorText(caught));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );
  const chooseRead = useCallback(() => setRole("read"), []);
  const chooseWrite = useCallback(() => setRole("write"), []);
  const submit = useCallback(() => void handleShare(), [handleShare]);

  return (
    <View style={styles.root} testID="hub-share">
      <BackHeader title={GROUPON_SHARE.title} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {overview === null && !error ? <ActivityIndicator /> : null}
        {overview && !workspace ? <Text style={styles.muted}>{GROUPON_SHARE.notOnHub}</Text> : null}
        {workspace ? (
          <>
            <Text style={styles.name}>{workspace.name}</Text>
            <Text style={styles.muted}>{GROUPON_SHARE.intro}</Text>
            <AuthorLegend />
            <View style={styles.card}>
              <Text style={styles.label}>{GROUPON_SHARE.emailLabel}</Text>
              <EditingTextInput
                initialValue=""
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder={GROUPON_SHARE.emailPlaceholder}
                editable={!busy}
                style={styles.input}
                testID="hub-share-email"
              />
              <View style={styles.row}>
                <Button
                  variant={role === "read" ? "default" : "outline"}
                  size="sm"
                  onPress={chooseRead}
                  testID="hub-share-role-read"
                >
                  {GROUPON_SHARE.read}
                </Button>
                <Button
                  variant={role === "write" ? "default" : "outline"}
                  size="sm"
                  onPress={chooseWrite}
                  testID="hub-share-role-write"
                >
                  {GROUPON_SHARE.write}
                </Button>
              </View>
              <Button onPress={submit} loading={busy} testID="hub-share-submit">
                {busy ? GROUPON_SHARE.sharing : GROUPON_SHARE.share}
              </Button>
            </View>
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            <PeopleNow workspaceId={workspace.id} />
            <Text style={styles.label}>{GROUPON_SHARE.whoHasAccess}</Text>
            {grants.length === 0 ? <Text style={styles.muted}>{GROUPON_SHARE.nobody}</Text> : null}
            {grants.map((grant) => (
              <GrantRow
                key={grant.id}
                shareId={grant.id}
                email={grant.grantee.email}
                name={grant.grantee.name}
                role={grant.role}
                keyed={grant.sealedShareKey !== null}
                busy={busy}
                onRevoke={handleRevoke}
              />
            ))}
          </>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

/** "People in this session now": the same check-in the row above the composer reads. */
function PeopleNow({ workspaceId }: { workspaceId: string }) {
  const presence = useHubPresence(workspaceId);
  const onlyYou = (presence.data?.people ?? []).every((person) => person.you);
  return (
    <View testID="hub-share-presence">
      <Text style={styles.label}>{GROUPON_PRESENCE.section}</Text>
      {presence.data && onlyYou ? (
        <Text style={styles.muted}>{GROUPON_PRESENCE.nobodyElse}</Text>
      ) : (
        presenceLines(presence.data).map((line) => (
          <Text key={line} style={styles.muted}>
            {line}
          </Text>
        ))
      )}
    </View>
  );
}

function GrantRow({
  shareId,
  email,
  name,
  role,
  keyed,
  busy,
  onRevoke,
}: {
  shareId: string;
  email: string;
  name: string;
  role: HubShareRole;
  keyed: boolean;
  busy: boolean;
  onRevoke: (shareId: string, email: string) => Promise<void>;
}) {
  const revoke = useCallback(() => void onRevoke(shareId, email), [email, onRevoke, shareId]);
  const facts = [email, role === "write" ? GROUPON_SHARE.write : GROUPON_SHARE.read];
  if (!keyed) facts.push(GROUPON_SHARE.keyWaiting);
  return (
    <View style={styles.grant} testID={`hub-share-grant-${shareId}`}>
      <View style={styles.grantText}>
        <Text style={styles.grantName}>{name}</Text>
        <Text style={styles.muted}>{facts.join(" · ")}</Text>
      </View>
      <Button
        variant="outline"
        size="sm"
        onPress={revoke}
        disabled={busy}
        testID={`hub-share-revoke-${shareId}`}
      >
        {GROUPON_SHARE.revoke}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.surface0 },
  scroll: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  name: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  label: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  muted: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  notice: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
  error: { color: theme.colors.destructive, fontSize: theme.fontSize.sm },
  card: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  row: { flexDirection: "row", gap: theme.spacing[2] },
  grant: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  grantText: { flex: 1, gap: theme.spacing[0.5] },
  grantName: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
}));
