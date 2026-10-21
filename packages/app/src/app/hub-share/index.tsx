// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Share route of a hub workspace.
import { useLocalSearchParams } from "expo-router";
import { HubShareScreen } from "@/groupon/share-screen";

export default function HubShareRoute() {
  const params = useLocalSearchParams<{
    workspaceId?: string;
    serverId?: string;
    daemonWorkspaceId?: string;
    path?: string;
  }>();
  return (
    <HubShareScreen
      workspaceId={params.workspaceId}
      serverId={params.serverId}
      daemonWorkspaceId={params.daemonWorkspaceId}
      path={params.path}
    />
  );
}
