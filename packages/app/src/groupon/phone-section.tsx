// Added for Groupon Desk (fork of Paseo, Apache-2.0): Settings > Your phone, in place of Paseo's Pair device.

/**
 * What a person does to use Groupon Desk on their phone: open the work window's web address,
 * sign in with the same Google account, and their Macs appear among the hosts, reached through
 * Core. One paragraph, the address as a copyable line, and a QR code of that address.
 *
 * Constraints:
 * - Never shows or exports a pairing offer, a relay link or a daemon key: the phone reaches a Mac
 *   through Core, not through Paseo's pairing (owner, 2026-10-19)
 * - The address is the signed-in environment's (`GROUPON_DESK_WEB_URL`), never typed here
 */

import * as QRCode from "qrcode";
import { Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useFetchQuery } from "@/data/query";
import type { Theme } from "@/styles/theme";
import { CopyLine } from "./copy-line";
import { GROUPON_DESK_WEB_URL } from "./environments";
import { useGrouponStore } from "./session";
import { GROUPON_PHONE } from "./strings";

const ThemedSpinner = withUnistyles(LoadingSpinner);
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/** The settings page: the instruction, the address, its QR code. */
export function GrouponPhonePage() {
  const environmentId = useGrouponStore((state) => state.environmentId);
  const address = GROUPON_DESK_WEB_URL[environmentId];
  return (
    <SettingsSection title={GROUPON_PHONE.title}>
      <View style={styles.card} testID="groupon-phone-section">
        <Text style={styles.body}>{GROUPON_PHONE.body}</Text>
        <CopyLine
          text={address}
          accessibilityLabel={GROUPON_PHONE.addressLabel}
          testID="groupon-phone-address"
        />
        <View style={styles.qrTile}>
          <AddressQr address={address} />
        </View>
      </View>
    </SettingsSection>
  );
}

function AddressQr({ address }: { address: string }) {
  const qr = useFetchQuery({
    queryKey: ["groupon-phone-qr", address],
    queryFn: () => QRCode.toString(address, { type: "svg", errorCorrectionLevel: "M", margin: 1 }),
    dataShape: "value",
    // Paseo's query hook refuses an infinite stale time (it threw on the Your phone page, 2026-10-20): a day.
    staleTimeMs: 24 * 60 * 60 * 1000,
  });
  if (qr.data) {
    return (
      <SvgXml
        xml={qr.data}
        width="100%"
        height="100%"
        accessibilityRole="image"
        accessibilityLabel={GROUPON_PHONE.qrLabel}
        testID="groupon-phone-qr"
      />
    );
  }
  if (qr.isError) return <Text style={styles.muted}>{GROUPON_PHONE.qrUnavailable}</Text>;
  return <ThemedSpinner size="small" uniProps={mutedMapping} />;
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.spacing[4],
    padding: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  body: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: theme.fontSize.base * 1.5,
  },
  qrTile: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    width: 240,
    maxWidth: "100%",
    aspectRatio: 1,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.palette.white,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
}));
