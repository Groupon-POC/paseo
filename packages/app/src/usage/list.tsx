// Changed for Groupon Desk (fork of Paseo, Apache-2.0): `renderCardAction` puts a row under each card's account line.
import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { UsageCard } from "./card";
import type { UsageDisplay } from "./display";
import { useUsageInSidebar } from "./in-sidebar";
import type { UsageReportEntry } from "./types";

/** One card per report (source + account). Window rows pin while the sidebar summary is on. */
export function UsageList({
  serverId,
  reports,
  display,
  renderCardAction,
}: {
  serverId: string;
  reports: UsageReportEntry[];
  display: UsageDisplay;
  renderCardAction?: (entry: UsageReportEntry) => ReactNode;
}) {
  const { inSidebar } = useUsageInSidebar();
  return (
    <View style={styles.list}>
      {reports.map((entry) => (
        <View key={entry.id} style={settingsStyles.card}>
          <UsageCard
            serverId={serverId}
            entry={entry}
            display={display}
            pinnable={inSidebar}
            refreshable
            footerAction={renderCardAction?.(entry)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.spacing[3],
  },
}));
