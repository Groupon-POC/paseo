// Added for Groupon Desk (fork of Paseo, Apache-2.0): the "+" beside the Workspaces filter that opens Add a project.

import { Plus } from "lucide-react-native";
import { useCallback } from "react";
import { withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { useOpenAddProject } from "@/hooks/use-open-add-project";

const ThemedPlus = withUnistyles(Plus);
const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/**
 * The Workspaces section's own way to add a project, as Conductor's sidebar has one: the same
 * Add a project flow the footer's folder button and the home tile open, From GitHub among its ways.
 */
export function SidebarAddProjectButton() {
  const openAddProject = useOpenAddProject();
  const handlePress = useCallback(() => openAddProject(), [openAddProject]);
  return (
    <ToolbarButton
      label="Add a project"
      onPress={handlePress}
      testID="sidebar-workspaces-add-project"
    >
      <ThemedPlus size={15} uniProps={mutedIconMapping} />
    </ToolbarButton>
  );
}
