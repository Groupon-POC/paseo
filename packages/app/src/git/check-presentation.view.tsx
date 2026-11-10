// Changed for Groupon Desk (fork of Paseo, Apache-2.0): an icon sits in a fixed slot (`IconSlot`), so a long one-line text beside it cannot shrink it.
import { useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CircleCheck, CircleDot, CircleSlash, CircleX } from "lucide-react-native";
import { ManualStatusIcon } from "@/components/icons/manual-status-icon";
import type { Theme } from "@/styles/theme";
import type { CheckPresentation } from "./check-presentation";

const ThemedCircleCheck = withUnistyles(CircleCheck);
const ThemedCircleDot = withUnistyles(CircleDot);
const ThemedCircleSlash = withUnistyles(CircleSlash);
const ThemedCircleX = withUnistyles(CircleX);
const ThemedManualStatusIcon = withUnistyles(ManualStatusIcon);

const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const successColorMapping = (theme: Theme) => ({ color: theme.colors.statusSuccess });
const dangerColorMapping = (theme: Theme) => ({ color: theme.colors.statusDanger });
const warningColorMapping = (theme: Theme) => ({ color: theme.colors.statusWarning });

export type CheckPresentationTone = "success" | "danger" | "warning" | "muted";

interface CheckPresentationViewPolicy {
  tone: CheckPresentationTone;
  renderIcon: (size: number) => ReactNode;
}

const CHECK_PRESENTATION_VIEW_POLICY: Record<CheckPresentation, CheckPresentationViewPolicy> = {
  success: {
    tone: "success",
    renderIcon(size) {
      return <ThemedCircleCheck size={size} uniProps={successColorMapping} />;
    },
  },
  failure: {
    tone: "danger",
    renderIcon(size) {
      return <ThemedCircleX size={size} uniProps={dangerColorMapping} />;
    },
  },
  warning: {
    tone: "warning",
    renderIcon(size) {
      return <ThemedCircleX size={size} uniProps={warningColorMapping} />;
    },
  },
  actionRequired: {
    tone: "warning",
    renderIcon(size) {
      return <ThemedManualStatusIcon size={size} uniProps={warningColorMapping} />;
    },
  },
  manual: {
    tone: "muted",
    renderIcon(size) {
      return <ThemedManualStatusIcon size={size} uniProps={foregroundMutedColorMapping} />;
    },
  },
  pending: {
    tone: "warning",
    renderIcon(size) {
      return <ThemedCircleDot size={size} uniProps={warningColorMapping} />;
    },
  },
  ignored: {
    tone: "muted",
    renderIcon(size) {
      return <ThemedCircleSlash size={size} uniProps={foregroundMutedColorMapping} />;
    },
  },
};

export function getCheckPresentationTone(presentation: CheckPresentation): CheckPresentationTone {
  return CHECK_PRESENTATION_VIEW_POLICY[presentation].tone;
}

// On web an icon is a bare <svg>, which shrinks in a flex row; a View does not.
export function IconSlot({ size, children }: { size: number; children: ReactNode }) {
  const style = useMemo(() => [styles.iconSlot, { width: size, height: size }], [size]);
  return <View style={style}>{children}</View>;
}

export function CheckPresentationIcon({
  presentation,
  size,
}: {
  presentation: CheckPresentation;
  size: number;
}): ReactNode {
  return (
    <IconSlot size={size}>{CHECK_PRESENTATION_VIEW_POLICY[presentation].renderIcon(size)}</IconSlot>
  );
}

const styles = StyleSheet.create({
  iconSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
});
