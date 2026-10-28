// Added for Groupon Desk (fork of Paseo, Apache-2.0): Claude Code's "You've hit your limit" as a red notice in the chat, with the time left until the reset.

import { useEffect } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Alert } from "@/components/ui/alert";
import { useRefreshUsageReports } from "@/usage/queries";
import { GROUPON_USAGE_LIMIT } from "./strings";
import { timeUntilReset, type UsageLimitNotice } from "./usage-limit-model";
import { useTickingNow } from "./use-ticking-now";

export function UsageLimitNoticeRow({
  notice,
  serverId,
}: {
  notice: UsageLimitNotice;
  serverId: string | null;
}) {
  const live = notice.resetsAt !== null && notice.resetsAt.getTime() > Date.now();
  const now = useTickingNow(live);
  const left = notice.resetsAt ? timeUntilReset(notice.resetsAt, now) : null;
  const refreshUsage = useRefreshUsageReports(serverId);
  // The sidebar's reading can be minutes old when a limit bites: read it again at once.
  useEffect(() => {
    if (live) refreshUsage();
  }, [live, refreshUsage]);
  return (
    <View style={styles.row}>
      <Alert
        variant="error"
        title={GROUPON_USAGE_LIMIT.title(notice.limit)}
        description={describeReset(notice, left)}
        testID="usage-limit-notice"
      />
    </View>
  );
}

function describeReset(notice: UsageLimitNotice, left: string | null): string {
  if (left) return GROUPON_USAGE_LIMIT.resetsIn(left, notice.resetsText);
  if (notice.resetsAt) return GROUPON_USAGE_LIMIT.reset(notice.resetsText);
  return GROUPON_USAGE_LIMIT.resetsAt(notice.resetsText);
}

const styles = StyleSheet.create((theme) => ({
  row: {
    paddingVertical: theme.spacing[1],
  },
}));
