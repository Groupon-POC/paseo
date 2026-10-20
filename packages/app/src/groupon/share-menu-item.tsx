// Added for Groupon Desk (fork of Paseo, Apache-2.0): "Share…" on a workspace's menu in the sidebar.
import { useCallback } from "react";
import { router } from "expo-router";
import { Share2 } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { Theme } from "@/styles/theme";
import { useGrouponStore } from "./session";
import { hubShareRoute } from "./share-route";
import { GROUPON_SHARE } from "./strings";

const ThemedShare = withUnistyles(Share2);
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const leadingIcon = <ThemedShare size={14} uniProps={foregroundMutedColorMapping} />;

/** Shown only when the person is signed in to Groupon and the workspace has a folder to look it up by. */
export function ShareWorkspaceMenuItem({
  path,
  testID,
  surface = "dropdown",
}: {
  path?: string | null;
  testID: string;
  surface?: "context" | "dropdown";
}) {
  const ready = useGrouponStore((state) => state.status === "ready");
  const folder = path?.trim() ?? "";
  const open = useCallback(() => router.push(hubShareRoute({ path: folder })), [folder]);
  if (!ready || folder.length === 0) return null;
  const Item = surface === "context" ? ContextMenuItem : DropdownMenuItem;
  return (
    <Item testID={testID} leading={leadingIcon} onSelect={open}>
      {GROUPON_SHARE.menu}
    </Item>
  );
}
