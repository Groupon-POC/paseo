// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Switch on a Groupon subscription card in the Usage modal.

/**
 * The bottom row of a "Groupon subscriptions" card: "In use" on the Mac's default Claude Code
 * sign-in, Switch on the others (`groupon.mac-subscription-switch`), Groupon Desk's refusal when it
 * refused. The RPCs reach the daemon of the Mac the modal shows, so a remote Mac switches the
 * same way as this one.
 *
 * Constraints:
 * - Every card of a Mac reads one `groupon.mac-subscription` query; a switch writes its
 *   `switching` into that query at once, so every other card's Switch holds until it is answered
 * - After an answer the query is read again and the Mac's usage refreshed, since its cards'
 *   account lines say which one is the default sign-in
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useRefreshUsageReports } from "@/usage/queries";
import type { UsageReportEntry } from "@/usage/types";
import {
  pluginProblemText,
  readMacSubscription,
  switchMacSubscription,
  type MacSubscriptionAnswer,
} from "./desk-plugin-rpc";
import { GROUPON_USAGE_SWITCH } from "./strings";
import {
  cardProviderId,
  cardSwitchOf,
  type CardSwitchAction,
  type SubscriptionSwitchStatus,
} from "./usage-subscription-switch-model";

/** Groupon Desk's rotations move the default sign-in without telling the window. */
const MAC_SUBSCRIPTION_STALE_MS = 30_000;

const macSubscriptionKey = (serverId: string) => ["groupon-mac-subscription", serverId] as const;

/** The card's switch row; nothing on a card that is no Groupon subscription of that Mac. */
export function UsageSubscriptionSwitch({
  serverId,
  entry,
}: {
  serverId: string;
  entry: UsageReportEntry;
}) {
  const providerId = cardProviderId(entry);
  if (!providerId) return null;
  return <SubscriptionSwitchRow serverId={serverId} providerId={providerId} />;
}

function SubscriptionSwitchRow({ serverId, providerId }: { serverId: string; providerId: string }) {
  const client = useHostRuntimeClient(serverId);
  const queryClient = useQueryClient();
  const refreshUsage = useRefreshUsageReports(serverId);
  const [status, setStatus] = useState<SubscriptionSwitchStatus>({ kind: "idle" });
  const queryKey = useMemo(() => macSubscriptionKey(serverId), [serverId]);
  const query = useFetchQuery({
    queryKey,
    queryFn: async () => {
      if (!client) throw new Error("This Mac is not connected.");
      return readMacSubscription(client);
    },
    enabled: Boolean(client),
    dataShape: "value",
    // An older plugin without the RPC does not grow one on retry; the card then offers nothing.
    retry: false,
    staleTimeMs: MAC_SUBSCRIPTION_STALE_MS,
  });
  const handleSwitch = useCallback(
    async (email: string) => {
      if (!client) return;
      setStatus({ kind: "switching", email });
      // A read still on its way would write the Mac's answer from before the switch over this.
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<MacSubscriptionAnswer>(queryKey, (current) =>
        current
          ? {
              ...current,
              lastSwitch: {
                id: "window",
                email,
                state: "switching",
                message: null,
                at: new Date().toISOString(),
              },
            }
          : current,
      );
      try {
        const answer = await switchMacSubscription(client, email);
        setStatus(
          answer.state === "failed"
            ? {
                kind: "failed",
                email,
                message: answer.message ?? GROUPON_USAGE_SWITCH.couldNotSwitch(email),
              }
            : { kind: "idle" },
        );
      } catch (error) {
        setStatus({ kind: "failed", email, message: pluginProblemText(error) });
      }
      await queryClient.invalidateQueries({ queryKey });
      refreshUsage();
    },
    [client, queryClient, queryKey, refreshUsage],
  );
  const offer = cardSwitchOf(providerId, query.data, status);
  if (!offer) return null;
  const { action, refusal, machine } = offer;
  const note = refusal ?? noteOf(action, machine);
  return (
    <View style={styles.row} testID="usage-subscription-switch">
      <Text style={refusal ? styles.refusal : styles.note} numberOfLines={3}>
        {note}
      </Text>
      {action.kind === "in-use" ? (
        <StatusBadge label={GROUPON_USAGE_SWITCH.inUse} variant="success" size="xs" />
      ) : null}
      {action.kind === "switching" ? (
        <Button variant="secondary" size="xs" loading disabled>
          {GROUPON_USAGE_SWITCH.switching}
        </Button>
      ) : null}
      {action.kind === "sign-in-again" ? (
        <StatusBadge label={GROUPON_USAGE_SWITCH.signInAgain} variant="error" size="xs" />
      ) : null}
      {action.kind === "switch" ? (
        <SwitchButton
          email={action.email}
          machine={machine}
          disabled={action.disabled}
          onSwitch={handleSwitch}
        />
      ) : null}
    </View>
  );
}

function noteOf(action: CardSwitchAction, machine: string): string | null {
  if (action.kind === "in-use") return GROUPON_USAGE_SWITCH.inUseNote(machine);
  if (action.kind === "switching") return GROUPON_USAGE_SWITCH.switchingNote(machine);
  return null;
}

function SwitchButton({
  email,
  machine,
  disabled,
  onSwitch,
}: {
  email: string;
  machine: string;
  disabled: boolean;
  onSwitch: (email: string) => Promise<void>;
}) {
  const handlePress = useCallback(() => void onSwitch(email), [email, onSwitch]);
  return (
    <Button
      variant="secondary"
      size="xs"
      disabled={disabled}
      accessibilityLabel={GROUPON_USAGE_SWITCH.switchLabel(machine, email)}
      onPress={handlePress}
      testID="usage-subscription-switch-button"
    >
      {GROUPON_USAGE_SWITCH.switchAction}
    </Button>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: 28,
  },
  note: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  refusal: {
    flex: 1,
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.4,
  },
}));
